import test from 'node:test'
import assert from 'node:assert/strict'
import { request } from 'node:http'
import { once } from 'node:events'
import {
  createAgentServer,
  LIMITS,
  loadConfig,
  requestSuggestion,
  validateOutput,
  validateRequest,
} from './agent.mjs'

const environment = {
  FOLIOHUSH_AI_BASE_URL: 'https://provider.example/v1',
  FOLIOHUSH_AI_MODEL: 'explicit-test-model',
  FOLIOHUSH_AI_API_KEY: 'test-only-key-never-real',
}
const input = {
  action: 'rewrite',
  instruction: 'Be concise.',
  context: 'A fictional draft.',
  providerHost: 'provider.example',
}
const suggestion = {
  blocks: [
    { type: 'heading', text: 'An idea' },
    { type: 'paragraph', text: 'A clearer fictional draft.' },
    { type: 'bullet', text: 'A useful detail.' },
  ],
  summary: 'Made the draft more concise.',
}
const providerResponse = (value = suggestion, overrides = {}) =>
  Response.json({
    choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) }, ...overrides }],
  })
const config = (extra = {}) => loadConfig({ ...environment, ...extra })
const signal = () => new AbortController().signal

// Use raw HTTP for local integration tests: browser/Node fetch owns the Host header.
// A real deployment preserves the browser Host through Vite/the authenticated proxy.
function localFetch(url, init = {}) {
  return new Promise((resolve, reject) => {
    const req = request(url, { method: init.method || 'GET', headers: init.headers }, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('error', reject)
      res.on('end', () =>
        resolve(
          new Response(Buffer.concat(chunks), {
            status: res.statusCode,
            headers: res.headers,
          }),
        ),
      )
    })
    req.on('error', reject)
    req.end(init.body)
  })
}

async function fixture(
  t,
  fetchImpl = async () => providerResponse(),
  options = {},
  cfg = config(),
) {
  const server = createAgentServer(cfg, { fetchImpl, ...options })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  })
  const address = `http://127.0.0.1:${server.address().port}`
  const call = (body = input, init = {}) =>
    localFetch(`${address}/api/agent`, {
      method: 'POST',
      body: JSON.stringify(body),
      ...init,
      headers: {
        Host: cfg.authority,
        Origin: cfg.origin,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    })
  return { server, address, call, config: cfg }
}

async function eventually(predicate) {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > 10_000) assert.fail('Expected event did not occur.')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

test('configuration is explicitly server-owned, disabled without credentials, and loopback-bound', () => {
  const missing = loadConfig({})
  assert.equal(missing.ready, false)
  assert.equal(missing.host, '127.0.0.1')
  assert.equal(config().ready, true)
  assert.equal(config().endpoint, 'https://provider.example/v1/chat/completions')
  assert.equal(
    config({ FOLIOHUSH_AI_BASE_URL: 'https://provider.example/v1/' }).endpoint,
    config().endpoint,
  )
})

test('configuration rejects unsafe origins, provider URLs, credentials and malformed limits', () => {
  for (const extra of [
    { FOLIOHUSH_APP_ORIGIN: 'http://remote.example' },
    { FOLIOHUSH_APP_ORIGIN: 'http://127.0.0.1:5173/' },
    { FOLIOHUSH_APP_ORIGIN: 'http://u:p@127.0.0.1:5173' },
    { FOLIOHUSH_AI_BASE_URL: 'http://provider.example/v1' },
    { FOLIOHUSH_AI_BASE_URL: 'https://user:secret@provider.example/v1' },
    { FOLIOHUSH_AI_BASE_URL: 'https://provider.example/v1?key=secret' },
    { FOLIOHUSH_AI_BASE_URL: 'https://provider.example/v1#fragment' },
    { FOLIOHUSH_AI_BASE_URL: 'http://127.0.0.1:11434/v1' },
    { FOLIOHUSH_AI_API_KEY: 'secret\r\nInjected: true' },
    { FOLIOHUSH_AI_MODEL: 'model\nother' },
    { FOLIOHUSH_AGENT_MODE: 'public' },
    { FOLIOHUSH_AGENT_MODE: 'proxy', FOLIOHUSH_APP_ORIGIN: 'https://writing.example' },
    { FOLIOHUSH_AGENT_PORT: '0' },
    { FOLIOHUSH_AGENT_PORT: '3001oops' },
    { FOLIOHUSH_AI_TIMEOUT_MS: '-1' },
  ]) {
    assert.throws(() => config(extra))
  }
  assert.equal(
    config({
      FOLIOHUSH_AI_BASE_URL: 'http://127.0.0.1:11434/v1',
      FOLIOHUSH_ALLOW_LOCAL_PROVIDER: '1',
    }).endpoint,
    'http://127.0.0.1:11434/v1/chat/completions',
  )
})

test('request validation bounds all fields, actions, blank input and extra keys', () => {
  for (const action of ['outline', 'continue', 'rewrite', 'format']) {
    assert.equal(validateRequest({ ...input, action }).action, action)
  }
  assert.deepEqual(
    validateRequest({ ...input, instruction: 'a'.repeat(1_000), context: 'b'.repeat(12_000) }),
    { ...input, instruction: 'a'.repeat(1_000), context: 'b'.repeat(12_000) },
  )
  for (const bad of [
    null,
    [],
    { ...input, action: 'execute' },
    { ...input, context: 4 },
    { ...input, providerHost: null },
    { ...input, providerHost: '' },
    { ...input, providerHost: 'x'.repeat(254) },
    { ...input, context: 'x'.repeat(12_001) },
    { ...input, instruction: 'x'.repeat(1_001) },
    { ...input, context: ' ', instruction: '\n' },
    { ...input, model: 'browser-cannot-select-a-provider' },
    { action: 'outline', instruction: 'Start.' },
  ]) {
    assert.throws(() => validateRequest(bad), { code: 'invalid_request' })
  }
})

test('output is reconstructed as plain blocks and rejects malformed, oversized and HTML data', () => {
  assert.deepEqual(validateOutput(suggestion), suggestion)
  assert.deepEqual(
    validateOutput({ blocks: [{ type: 'paragraph', text: '2 < 3 > 1' }], summary: '' }),
    {
      blocks: [{ type: 'paragraph', text: '2 < 3 > 1' }],
      summary: '',
    },
  )
  for (const bad of [
    null,
    { ...suggestion, debug: 'extra' },
    { ...suggestion, blocks: [] },
    { ...suggestion, summary: 's'.repeat(241) },
    { ...suggestion, summary: '<img src=x>' },
    { ...suggestion, blocks: Array(41).fill({ type: 'paragraph', text: 'a' }) },
    { ...suggestion, blocks: Array(9).fill({ type: 'paragraph', text: 'a'.repeat(3_000) }) },
    { ...suggestion, blocks: [{ type: 'paragraph', text: 'a'.repeat(3_001) }] },
    { ...suggestion, blocks: [{ type: 'paragraph', text: ' ' }] },
    { ...suggestion, blocks: [{ type: 'script', text: 'Run.' }] },
    { ...suggestion, blocks: [{ type: 'paragraph', text: '<script>alert(1)</script>' }] },
    { ...suggestion, blocks: [{ type: 'paragraph', text: 'bad\u0000' }] },
    {
      ...suggestion,
      blocks: [{ type: 'paragraph', text: 'safe', attrs: { href: 'javascript:x' } }],
    },
  ]) {
    assert.throws(() => validateOutput(bad), { code: 'invalid_response' })
  }
  assert.equal(
    validateOutput({
      summary: 's'.repeat(240),
      blocks: Array(8).fill({ type: 'paragraph', text: 'a'.repeat(3_000) }),
    }).blocks.length,
    8,
  )
})

test('provider adapter sends the server configuration and strict schema, with no tools or retry', async () => {
  let calls = 0
  const result = await requestSuggestion(input, config(), signal(), async (url, options) => {
    calls++
    assert.equal(url, 'https://provider.example/v1/chat/completions')
    assert.equal(options.headers.Authorization, 'Bearer test-only-key-never-real')
    assert.equal(options.redirect, 'error')
    const body = JSON.parse(options.body)
    assert.equal(body.model, 'explicit-test-model')
    assert.equal(body.response_format.type, 'json_schema')
    assert.equal(body.response_format.json_schema.strict, true)
    assert.equal(body.response_format.json_schema.schema.additionalProperties, false)
    assert.equal(body.max_completion_tokens, 4_096)
    assert.equal(body.store, false)
    assert.equal(body.stream, false)
    assert.equal(body.tools, undefined)
    assert.deepEqual(JSON.parse(body.messages[1].content), {
      action: input.action,
      instruction: input.instruction,
      context: input.context,
    })
    return providerResponse()
  })
  assert.equal(calls, 1)
  assert.deepEqual(result, suggestion)
})

test('provider refusals, truncation, missing choice, malformed JSON, and bad status fail closed', async () => {
  for (const fake of [
    async () => providerResponse(suggestion, { finish_reason: 'length' }),
    async () => providerResponse(suggestion, { message: { content: '{}' } }),
    async () => providerResponse(suggestion, { message: { content: 'not json' } }),
    async () => Response.json({ choices: [] }),
    async () => new Response('malformed'),
    async () => new Response('private provider error and secret key', { status: 401 }),
  ]) {
    await assert.rejects(requestSuggestion(input, config(), signal(), fake), (error) => {
      assert.equal(error.status, 502)
      assert.doesNotMatch(error.message, /private|secret key/)
      return true
    })
  }
  await assert.rejects(
    requestSuggestion(input, config(), signal(), async () =>
      providerResponse(suggestion, { message: { refusal: 'private refusal details' } }),
    ),
    { status: 422, code: 'refused' },
  )
})

test('provider response size is capped for advertised and chunked oversized bodies', async () => {
  for (const response of [
    new Response('small', { headers: { 'content-length': String(LIMITS.providerBytes + 1) } }),
    new Response('x'.repeat(LIMITS.providerBytes + 1)),
  ]) {
    await assert.rejects(
      requestSuggestion(input, config(), signal(), async () => response),
      {
        status: 502,
        code: 'invalid_response',
      },
    )
  }
})

test('HTTP happy path returns only suggestion and non-cacheable security headers', async (t) => {
  const { call } = await fixture(t)
  const response = await call()
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(response.headers.get('access-control-allow-origin'), null)
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  assert.deepEqual(await response.json(), suggestion)
})

test('HTTP rejects cross-origin, missing Origin, DNS-rebinding Host, and cross-site metadata', async (t) => {
  let calls = 0
  const { call } = await fixture(t, async () => {
    calls++
    return providerResponse()
  })
  for (const headers of [
    { Origin: 'https://evil.example' },
    { Origin: 'null' },
    { Origin: '' },
    { Origin: 'http://127.0.0.1:5173/' },
    { Host: 'evil.example' },
    { 'Sec-Fetch-Site': 'cross-site' },
    { 'Sec-Fetch-Site': 'same-site' },
  ]) {
    const response = await call(input, { headers })
    assert.equal(response.status, 403)
    await response.text()
  }
  assert.equal(calls, 0)
})

test('HTTP rejects unsafe request shapes and unsupported content without provider calls', async (t) => {
  let calls = 0
  const { call } = await fixture(t, async () => {
    calls++
    return providerResponse()
  })
  for (const [body, init, expected] of [
    [{ ...input, endpoint: 'https://evil.example' }, {}, 400],
    [{ ...input, context: 'x'.repeat(12_001) }, {}, 400],
    [input, { body: 'not json' }, 400],
    [input, { headers: { 'Content-Type': 'text/plain' } }, 415],
    [input, { headers: { 'Content-Encoding': 'gzip' } }, 415],
    [input, { body: 'x'.repeat(LIMITS.requestBytes + 1) }, 413],
  ]) {
    const response = await call(body, init)
    assert.equal(response.status, expected)
    await response.text()
  }
  assert.equal(calls, 0)
})

test('HTTP bounds a chunked body before parsing or contacting the provider', async (t) => {
  let calls = 0
  const { address, config: cfg } = await fixture(t, async () => {
    calls++
    return providerResponse()
  })
  const req = request(`${address}/api/agent`, {
    method: 'POST',
    headers: { Host: cfg.authority, Origin: cfg.origin, 'Content-Type': 'application/json' },
  })
  req.on('error', () => {})
  const responsePromise = once(req, 'response')
  req.write('x'.repeat(LIMITS.requestBytes))
  req.end('x')
  const [res] = await responsePromise
  assert.equal(res.statusCode, 413)
  res.resume()
  await once(res, 'end')
  assert.equal(calls, 0)
})

test('status reveals readiness only and a disabled gateway performs no provider call', async (t) => {
  let calls = 0
  const { address, call } = await fixture(t, async () => calls++, {}, loadConfig({}))
  const status = await localFetch(`${address}/api/agent/status`, {
    headers: { Host: '127.0.0.1:5173' },
  })
  assert.equal(status.status, 200)
  assert.deepEqual(await status.json(), { ready: false, providerHost: null })
  const response = await call()
  assert.equal(response.status, 503)
  assert.equal((await response.json()).error.code, 'not_configured')
  assert.equal(calls, 0)
})

test('configured status exposes only readiness and provider hostname without a provider call', async (t) => {
  let calls = 0
  const { address, config: cfg } = await fixture(t, async () => calls++)
  const response = await localFetch(`${address}/api/agent/status`, {
    headers: { Host: cfg.authority },
  })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ready: true, providerHost: 'provider.example' })
  assert.equal(calls, 0)
})

test('POST requires an Origin even when no fetch metadata was sent', async (t) => {
  let calls = 0
  const { address, config: cfg } = await fixture(t, async () => calls++)
  const response = await localFetch(`${address}/api/agent`, {
    method: 'POST',
    headers: { Host: cfg.authority, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  assert.equal(response.status, 403)
  await response.text()
  assert.equal(calls, 0)
})

test('proxy mode requires both an exact trusted proxy token and an authenticated identity', async (t) => {
  const cfg = config({
    FOLIOHUSH_AGENT_MODE: 'proxy',
    FOLIOHUSH_APP_ORIGIN: 'https://writing.example',
    FOLIOHUSH_PROXY_TOKEN: 'test-proxy-token-with-at-least-32-characters',
  })
  const { call, address } = await fixture(t, undefined, {}, cfg)
  for (const headers of [
    {},
    { 'X-Foliohush-Proxy-Token': cfg.proxyToken },
    { 'X-Foliohush-User': 'user@example.test' },
    { 'X-Foliohush-Proxy-Token': 'wrong'.repeat(10), 'X-Foliohush-User': 'user@example.test' },
  ]) {
    const response = await call(input, { headers })
    assert.equal(response.status, 403)
    await response.text()
  }
  const response = await call(input, {
    headers: { 'X-Foliohush-Proxy-Token': cfg.proxyToken, 'X-Foliohush-User': 'user@example.test' },
  })
  assert.equal(response.status, 200)
  await response.text()
  const status = await localFetch(`${address}/api/agent/status`, {
    headers: { Host: cfg.authority },
  })
  assert.equal(status.status, 403)
  await status.text()
})

test('generation is bound to the provider host that the client reviewed', async (t) => {
  let calls = 0
  const { call } = await fixture(t, async () => {
    calls++
    return providerResponse()
  })
  const changed = await call({ ...input, providerHost: 'previous-provider.example' })
  assert.equal(changed.status, 409)
  assert.equal((await changed.json()).error.code, 'provider_changed')
  const missing = await call({
    action: input.action,
    instruction: input.instruction,
    context: input.context,
  })
  assert.equal(missing.status, 400)
  await missing.text()
  assert.equal(calls, 0)
  const matched = await call()
  assert.equal(matched.status, 200)
  await matched.text()
  assert.equal(calls, 1)
})

test('rate limit is global, unaffected by spoofed forwarded headers, and resets', async (t) => {
  let clock = 0
  let calls = 0
  const { call } = await fixture(
    t,
    async () => {
      calls++
      return providerResponse()
    },
    { now: () => clock },
  )
  for (let i = 0; i < LIMITS.requestsPerMinute; i++) {
    const response = await call()
    assert.equal(response.status, 200)
    await response.text()
  }
  const blocked = await call(input, { headers: { 'X-Forwarded-For': '192.0.2.42' } })
  assert.equal(blocked.status, 429)
  assert.equal(blocked.headers.get('retry-after'), '60')
  await blocked.text()
  assert.equal(calls, LIMITS.requestsPerMinute)
  clock += 60_000
  const resumed = await call()
  assert.equal(resumed.status, 200)
  await resumed.text()
})

test('concurrency is bounded and released after completion', async (t) => {
  const pending = []
  const { call } = await fixture(t, () => new Promise((resolve) => pending.push(resolve)))
  const first = call()
  const second = call()
  await eventually(() => pending.length === 2)
  const blocked = await call()
  assert.equal(blocked.status, 429)
  await blocked.text()
  pending.splice(0).forEach((resolve) => resolve(providerResponse()))
  assert.equal((await first).status, 200)
  assert.equal((await second).status, 200)
  const next = call()
  await eventually(() => pending.length === 1)
  pending[0](providerResponse())
  assert.equal((await next).status, 200)
})

test('provider errors never echo provider response, thrown errors, prompts, or keys', async (t) => {
  const { call } = await fixture(t, async () => {
    throw new Error('A fictional draft. test-only-key-never-real private stack')
  })
  const response = await call()
  assert.equal(response.status, 502)
  const body = await response.text()
  assert.doesNotMatch(body, /fictional|test-only-key|private stack/)
  assert.equal(JSON.parse(body).error.code, 'provider_error')
})

test('timeout aborts the provider request and returns a safe timeout', async (t) => {
  let providerSignal
  const { call } = await fixture(
    t,
    (_url, options) => {
      providerSignal = options.signal
      return new Promise(() => {})
    },
    {},
    config({ FOLIOHUSH_AI_TIMEOUT_MS: '1000' }),
  )
  const response = await call()
  assert.equal(response.status, 504)
  assert.equal((await response.json()).error.code, 'timeout')
  assert.equal(providerSignal.aborted, true)
})

test('client disconnect aborts the in-flight provider fetch and frees capacity', async (t) => {
  let providerSignal
  let calls = 0
  const {
    address,
    call,
    config: cfg,
  } = await fixture(t, (_url, options) => {
    calls++
    if (calls > 1) return Promise.resolve(providerResponse())
    providerSignal = options.signal
    return new Promise(() => {})
  })
  const req = request(`${address}/api/agent`, {
    method: 'POST',
    headers: { Host: cfg.authority, Origin: cfg.origin, 'Content-Type': 'application/json' },
  })
  req.on('error', () => {})
  req.end(JSON.stringify(input))
  await eventually(() => Boolean(providerSignal))
  req.destroy()
  await eventually(() => providerSignal.aborted)
  const response = await call()
  assert.equal(response.status, 200)
  await response.text()
})

test('timeout also covers a stalled provider response body', async (t) => {
  let cancelled = false
  const { call } = await fixture(
    t,
    async () =>
      new Response(
        new ReadableStream({
          cancel() {
            cancelled = true
          },
        }),
      ),
    {},
    config({ FOLIOHUSH_AI_TIMEOUT_MS: '1000' }),
  )
  const response = await call()
  assert.equal(response.status, 504)
  await response.text()
  await eventually(() => cancelled)
})

test('unknown paths, methods, preflights and query variants never reach the provider', async (t) => {
  let calls = 0
  const { address } = await fixture(t, async () => calls++)
  for (const [path, method] of [
    ['/api/agent', 'OPTIONS'],
    ['/api/agent', 'GET'],
    ['/api/agent?endpoint=evil', 'POST'],
    ['/api/agent/status?secret=1', 'GET'],
    ['/other', 'POST'],
  ]) {
    const response = await localFetch(`${address}${path}`, { method })
    assert.equal(response.status, 404)
    await response.text()
  }
  assert.equal(calls, 0)
})
