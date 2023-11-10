import { FastifyInstance } from 'fastify'
import { badRequest, unauthorized } from '@hapi/boom'
import { getArtifact, putArtifact, artifactsEvents, headArtifact, getStatus } from './routes'
import { createLocation } from './storage'
import { STORAGE_PROVIDERS } from '../../env'

async function turboRemoteCache(
  instance: FastifyInstance,
  options: {
    allowedTokens: string[]
    apiVersion?: `v${number}`
    provider?: STORAGE_PROVIDERS
  },
) {
  const bodyLimit = <number>instance.config.BODY_LIMIT
  const { allowedTokens, apiVersion = 'v8', provider = STORAGE_PROVIDERS.LOCAL } = options
  if (!(Array.isArray(allowedTokens) && allowedTokens.length)) {
    throw new Error(
      `'allowedTokens' options must be a string[], ${typeof allowedTokens} provided instead`,
    )
  }

  instance.addContentTypeParser<Buffer>(
    'application/octet-stream',
    { parseAs: 'buffer', bodyLimit },
    async function parser(request, payload) {
      return payload
    },
  )

  const tokens = new Set<string>(allowedTokens)
  instance.addHook('onRequest', async function (request) {
    let authHeader = request.headers['authorization']
    authHeader = Array.isArray(authHeader) ? authHeader.join() : authHeader

    if (!authHeader) {
      throw badRequest(`Missing Authorization header`)
    }
    const [, token] = authHeader.split('Bearer ')
    if (!tokens.has(token)) {
      throw unauthorized(`Invalid authorization token`)
    }
  })

  instance.decorate(
    'location',
    createLocation(provider, {
      accessKey: instance.config.S3_ACCESS_KEY,
      secretKey: instance.config.S3_SECRET_KEY,
      path: instance.config.STORAGE_PATH,
      region: instance.config.S3_REGION,
      endpoint: instance.config.S3_ENDPOINT,
      clientEmail: instance.config.GCS_CLIENT_EMAIL,
      privateKey: instance.config.GCS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      projectId: instance.config.GCS_PROJECT_ID,
      useTmp: !!instance.config.STORAGE_PATH_USE_TMP_FOLDER,
      connectionString: instance.config.ABS_CONNECTION_STRING,
    }),
  )

  await instance.register(
    async function (i) {
      i.route(getArtifact)
      i.route(headArtifact)
      if (!instance.config.READ_ONLY_MODE) {
        i.route(putArtifact)
      }
      i.route(artifactsEvents)
      i.route(getStatus)
    },
    { prefix: `/${apiVersion}` },
  )
}

export default turboRemoteCache
