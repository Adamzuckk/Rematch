const { app } = require('@azure/functions')

// Keep proxy POST bodies bounded before they reach the authenticated backend.
const MAX_PROXY_BODY_BYTES = 256 * 1024

const ROUTES = [
  { method: 'GET', pattern: /^\/api\/v1\/health$/ },
  { method: 'GET', pattern: /^\/api\/v1\/matches(?:\/(?:dataset|overview))?$/ },
  { method: 'GET', pattern: /^\/api\/v1\/matches\/[^/]+(?:\/(?:events|players|frames|intelligence))?$/ },
  { method: 'GET', pattern: /^\/api\/v1\/matches\/[^/]+\/events\/[^/]+\/decision-analysis(?:\/(?:narrative|evidence))?$/ },
  { method: 'GET', pattern: /^\/api\/v1\/matches\/[^/]+\/events\/[^/]+\/event-intelligence$/ },
  { method: 'POST', pattern: /^\/api\/v1\/matches\/[^/]+\/events\/[^/]+\/decision-analysis\/verify$/ },
]

function jsonError(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

async function proxy(request) {
  const incoming = new URL(request.url)
  const path = incoming.pathname
  if (!ROUTES.some(({ method, pattern }) => method === request.method && pattern.test(path))) {
    return jsonError(404, 'Route not found')
  }

  const baseUrl = process.env.BACKEND_BASE_URL
  const token = process.env.API_BEARER_TOKEN
  if (!baseUrl || !token) {
    return jsonError(503, 'Backend proxy is not configured')
  }

  let backend
  try {
    backend = new URL(baseUrl)
  } catch {
    return jsonError(503, 'Backend proxy is not configured')
  }
  if (
    backend.protocol !== 'https:' ||
    backend.origin !== 'https://rematch.whiteocean-a7603848.eastus.azurecontainerapps.io' ||
    backend.pathname !== '/' ||
    backend.search ||
    backend.hash
  ) {
    return jsonError(503, 'Backend proxy is not configured')
  }

  const headers = new Headers({ authorization: `Bearer ${token}` })
  const contentType = request.headers.get('content-type')
  if (contentType) headers.set('content-type', contentType)

  let body
  if (request.method === 'POST') {
    const declaredLength = Number(request.headers.get('content-length') || NaN)
    if (Number.isFinite(declaredLength) && declaredLength > MAX_PROXY_BODY_BYTES) {
      return jsonError(413, 'Request body too large')
    }
    const buffer = await request.arrayBuffer()
    if (buffer.byteLength > MAX_PROXY_BODY_BYTES) {
      return jsonError(413, 'Request body too large')
    }
    body = buffer
  }

  try {
    const upstream = await fetch(`${backend.origin}${path}${incoming.search}`, {
      method: request.method,
      headers,
      body,
    })
    const responseHeaders = new Headers()
    const upstreamContentType = upstream.headers.get('content-type')
    if (upstreamContentType) responseHeaders.set('content-type', upstreamContentType)
    const cacheControl = upstream.headers.get('cache-control')
    if (cacheControl) responseHeaders.set('cache-control', cacheControl)
    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    })
  } catch {
    return jsonError(502, 'Backend request failed')
  }
}

app.http('backendProxy', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  route: 'v1/{*path}',
  handler: proxy,
})
