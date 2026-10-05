# Optional writing agent / 写作助手 / Помощник / Schreibassistent

## English

The writing agent is optional. The editor, local documents, exports, and snapshots work without a provider. **GitHub Pages serves static files and cannot run this gateway. The public Pages demo does not have a live AI service.** To use real generation, self-host the app and gateway on the same origin and supply your own provider credentials. Enabling generation can incur provider charges.

### What is sent and what runs

Only an explicitly requested generation sends the action, instruction, and the context shown in the agent panel to your configured server and AI provider. A readiness check sends no document text. Other documents, snapshots, browser storage, and provider credentials are not included in the generation request. Review the context before sending it; provider privacy, retention, and billing rules still apply. The gateway sets `store: false`, which is not a claim of zero provider retention.

The server is a small Node.js HTTP gateway using built-in `fetch`, without an AI SDK or agent runtime. This is a single bounded writing request: it has no tools, browsing, filesystem access, shell execution, autonomous loop, memory, or remote document store. The provider returns a structured suggestion for review; generating it does not authorize applying it. The adapter uses the [Chat Completions API](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create) and strict JSON-schema output. It does not implement an unrestricted general-purpose agent.

### Local setup

Use Node.js 22.12 or newer. From the repository root:

```sh
npm ci
cp server/env.example .env.agent
```

Edit `.env.agent` locally. Set all three server-only provider variables:

- `FOLIOHUSH_AI_BASE_URL`: your provider's HTTPS API prefix, for example `https://api.openai.com/v1`. The server appends `/chat/completions`.
- `FOLIOHUSH_AI_MODEL`: an explicit model available to your account that supports Chat Completions, strict `json_schema`, `max_completion_tokens`, and `store: false`.
- `FOLIOHUSH_AI_API_KEY`: your own provider key.

There is no model or provider fallback. OpenAI-compatible does not guarantee support for these parameters; check your provider's current documentation. A provider rejection is shown as an error, without silently falling back to weaker JSON parsing or another provider. Never put keys in a `VITE_*` variable, browser storage, the UI, source code, or a shared screenshot. [OpenAI's authentication guidance](https://developers.openai.com/api/reference/overview) requires protecting keys on the server.

In two terminals:

```sh
npm run agent:server
npm run dev
```

The first command reads `.env.agent`; alternatively, export the variables and run `node server/index.mjs`. Open **exactly** `http://127.0.0.1:5173`. Vite forwards `/api/agent` to the loopback gateway on port 3001, keeping the original Host header. `localhost`, another port, and another scheme are different origins. If Vite selects another port, stop it and free port 5173 or update the origin and proxy configuration deliberately. A production build preview requires its actual origin configured too.

The gateway binds only `127.0.0.1`, even in proxy mode. Do not expose or forward its port directly, put an unauthenticated public tunnel in front of it, or publish the local development server. Local mode trusts other processes/users on the same computer; browser origin checks are not local-machine authentication. For an intentionally local provider, `FOLIOHUSH_ALLOW_LOCAL_PROVIDER=1` permits an HTTP base URL only at `127.0.0.1`, `localhost`, or `[::1]`. HTTPS remains required for other provider destinations.

The copied `.env.agent` is ignored by Git. Keep it readable only by the server operator. Production deployments should inject the same variables using the host's secret manager instead of copying this file into public assets.

### Remote self-hosting: authentication is required

Serve the built `dist/` and both `/api/agent` routes behind **one HTTPS origin** and an authenticated reverse proxy on the same machine. Do not deploy a public unauthenticated generation endpoint.

1. Set `FOLIOHUSH_AGENT_MODE=proxy` and `FOLIOHUSH_APP_ORIGIN=https://your-writing-host.example` with no trailing slash or path.
2. Generate your own random secret of at least 32 printable characters, store it as `FOLIOHUSH_PROXY_TOKEN` on the gateway, and securely configure the same secret at the proxy. This is a server-to-server credential; never send it to browser code.
3. Authenticate and authorize each user at the proxy. Protect both the generation and status routes. The gateway is not a user-account or session service.
4. **Remove and overwrite** incoming `X-Foliohush-Proxy-Token` and `X-Foliohush-User` headers. Set the former to your server-side secret and the latter to a nonempty identity from the proxy's verified session. Never derive either trusted header from client input. An anonymous request must be rejected before forwarding.
5. Forward to `http://127.0.0.1:3001`, preserving the browser's exact `Origin` and configured public `Host`. Disable caching, request/response body logging, and buffering that hides client disconnects. Set proxy limits/timeouts consistently with the gateway. Return API failures as JSON rather than an HTML login page where possible.
6. Keep the gateway port inaccessible from the network. Do not use cross-origin CORS, wildcard origins, `changeOrigin: true`, or trust arbitrary `X-Forwarded-*` headers to bypass these checks. Bind the proxy's backend to this same host; this reference gateway does not support a separately network-exposed container backend.
7. Add per-user quotas, operational monitoring without document contents, provider project budgets/alerts, and suitable HTTPS/security headers at the proxy. The process-wide limiter is a small abuse guard, not a complete public-service billing or identity system. Use a single gateway process unless the proxy supplies shared limits across replicas.

The gateway checks the proxy secret in constant time and requires a nonempty authenticated identity header. It cannot independently verify your proxy's login or authorization implementation. Review that deployment before entering real documents or making the service accessible to others.

### Contract and safety limits

`POST /api/agent` accepts only:

```json
{
  "action": "rewrite",
  "instruction": "Make this concise.",
  "context": "A fictional draft.",
  "providerHost": "api.openai.com"
}
```

`action` must be `outline`, `continue`, `rewrite`, or `format`. Instruction is at most 1,000 UTF-16 code units; context at most 12,000. They cannot both be blank. `providerHost` must match the hostname returned by the readiness check and reviewed by the user. A changed destination is rejected with 409 before any provider call, requiring a new review. It is a consent check, never a client-selected routing destination. Extra fields (including browser-supplied model, API key, or URL) are rejected. JSON must be uncompressed, at most 96 KiB, and have `Content-Type: application/json` (optional UTF-8 charset).

A successful response contains exactly:

```json
{
  "blocks": [{ "type": "paragraph", "text": "A concise fictional draft." }],
  "summary": "Shortened the draft."
}
```

There must be 1–40 blocks, each a `paragraph`, `heading`, or `bullet` with nonblank plain text of at most 3,000 UTF-16 code units. Total block text is at most 24,000; summary at most 240. Unsupported fields, HTML-like tags, and control characters are rejected. The client must still render and insert these values as text nodes, never interpret them as HTML. These are intentionally simple text blocks, not full-fidelity formatting preservation.

[Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=chat) describes strict schemas and separate refusal handling. This gateway independently validates the provider result, rejects incomplete/truncated responses and refusals, caps the upstream body at 256 KiB, and disables redirects and automatic retries. Its completion budget is 4,096 tokens including reasoning tokens, so long requested results may fail with a safe error rather than return a partial draft. Schema/parameter support can differ between models, especially fine-tuned models.

Each process permits up to 10 admitted generation attempts per minute and two concurrent requests, including body upload. Invalid admitted requests consume the rate budget. Other guards include an 8 KiB header limit, 32 connections, a 10-second incoming request/header timeout, and a configurable overall request deadline (`FOLIOHUSH_AI_TIMEOUT_MS`, default 45 seconds, range 1–120 seconds). Client disconnects and deadlines abort the upstream request. Aborting or cancelling **does not guarantee that provider processing or billing stops**.

`GET /api/agent/status` returns `{"ready":true,"providerHost":"api.openai.com"}` when configured, or `{"ready":false,"providerHost":null}`. Only the provider hostname is disclosed so users can check the destination before consenting; it excludes keys, the model, path, and URL parameters. This checks whether local configuration is present, **not** provider connectivity, model access, credit, or successful authentication with the provider. It does not call the provider. Both endpoints require the configured Host; POST additionally requires an exact Origin. Foreign fetch metadata/origins are rejected; no CORS permission is returned. Proxy mode protects status with the same trusted headers.

Errors use `{"error":{"code":"…","message":"…"}}`: 400 invalid request, 403 forbidden, 409 provider destination changed, 413 too large, 415 wrong content type, 422 refusal, 429 busy/rate-limited, 502 provider or malformed-output failure, 503 not configured, and 504 timeout. Retry only after reviewing the error; the gateway does not automatically retry paid requests. Errors and server startup output do not contain prompts, drafts, provider response bodies, stack traces, model names, URLs, or keys.

### Verification boundary

```sh
node --test server/*.test.mjs
```

Gateway tests inject a fake provider and use local HTTP requests. They cover request/output validation, strict provider payloads, origin/Host checks, proxy authentication, limits, safe errors, readiness, timeouts, and disconnect cancellation. **No real provider call, credential setup, paid generation, production reverse-proxy authentication, or hosted deployment is established by these tests.** Verify your chosen model, provider, account budget, and production proxy independently before live use. Do not treat mock responses or the Pages demo as proof of live AI integration.

## 简体中文

写作助手是可选功能；编辑、导出和快照无需 AI 服务。**GitHub Pages 只能托管静态页面，公共演示没有实时 AI 后端。** 如需真实生成，请自行部署同源应用和网关，并使用自己的服务商凭据；调用可能产生费用。

- 使用 Node.js 22.12+。将 `server/env.example` 复制为 `.env.agent`，填写 `FOLIOHUSH_AI_BASE_URL`、`FOLIOHUSH_AI_MODEL` 和 `FOLIOHUSH_AI_API_KEY`。分别运行 `npm run agent:server` 和 `npm run dev`，打开准确的 `http://127.0.0.1:5173`。
- 只有主动生成时，面板中的操作、指令和上下文才会发送给自托管网关及配置的服务商。请先检查内容和服务商隐私、保留与计费规则。就绪检查不发送文稿，也不验证服务商连接。
- 密钥只能保存在服务端；禁止放入 `VITE_*` 变量、界面、浏览器存储或仓库。网关仅监听本机回环地址。公开访问须使用同源 HTTPS、经过身份验证的反向代理、`proxy` 模式及服务端代理密钥。代理必须覆盖可信身份/密钥请求头；不能公开转发本地模式端口。
- 返回内容仅为待审阅的纯文本建议，不会自动修改文档。长度、请求频率、并发和超时均有限制；取消不保证服务商停止计费。上面的英文部分给出完整部署契约。
- 测试只使用模拟服务商，未验证真实调用、付费生成或生产认证。自行完成部署与服务商验证后再使用真实文稿。

## Русский

Помощник необязателен: редактор, экспорт и снимки работают без AI. **GitHub Pages размещает только статические файлы; у публичного демо нет действующего AI-сервера.** Для генерации самостоятельно разместите приложение и шлюз на одном origin и используйте собственные учётные данные провайдера. Вызовы могут быть платными.

- Нужен Node.js 22.12+. Скопируйте `server/env.example` в `.env.agent`, задайте `FOLIOHUSH_AI_BASE_URL`, `FOLIOHUSH_AI_MODEL` и `FOLIOHUSH_AI_API_KEY`. В отдельных терминалах запустите `npm run agent:server` и `npm run dev`; откройте именно `http://127.0.0.1:5173`.
- Только явный запрос генерации отправляет действие, инструкцию и показанный контекст вашему серверу и выбранному провайдеру. Проверьте текст, правила хранения данных и стоимость. Проверка готовности не отправляет документ и не проверяет соединение с провайдером.
- Ключи хранятся только на сервере, никогда в `VITE_*`, интерфейсе, браузерном хранилище или репозитории. Шлюз слушает лишь loopback. Для удалённого доступа нужны единый HTTPS-origin, reverse proxy с аутентификацией, режим `proxy` и серверный секрет. Proxy обязан перезаписывать доверенные заголовки личности и секрета; публичный туннель к локальному режиму недопустим.
- Ответ — текстовое предложение для проверки; документ не изменяется автоматически. Действуют ограничения размера, частоты, параллелизма и времени. Отмена не гарантирует прекращения списаний у провайдера. Полный контракт развёртывания приведён выше на английском.
- Тесты используют подставного провайдера. Реальные вызовы, платная генерация и производственная аутентификация не проверены; подтвердите их самостоятельно до работы с настоящими документами.

## Deutsch

Der Schreibassistent ist optional. Editor, Export und Schnappschüsse funktionieren ohne AI-Dienst. **GitHub Pages liefert nur statische Dateien; die öffentliche Demo besitzt keinen aktiven AI-Server.** Für echte Generierung müssen App und Gateway unter derselben Origin selbst gehostet werden. Dafür sind eigene Zugangsdaten des Anbieters erforderlich; Aufrufe können Kosten verursachen.

- Node.js 22.12+ verwenden. `server/env.example` nach `.env.agent` kopieren und `FOLIOHUSH_AI_BASE_URL`, `FOLIOHUSH_AI_MODEL` sowie `FOLIOHUSH_AI_API_KEY` setzen. In zwei Terminals `npm run agent:server` und `npm run dev` starten; exakt `http://127.0.0.1:5173` öffnen.
- Erst die ausdrücklich gestartete Generierung sendet Aktion, Anweisung und angezeigten Kontext an den eigenen Server und Anbieter. Inhalt, Datenschutz, Aufbewahrung und Kosten vorher prüfen. Die Bereitschaftsabfrage sendet keinen Entwurf und prüft keine Anbieterverbindung.
- Schlüssel gehören ausschließlich auf den Server, niemals in `VITE_*`, Oberfläche, Browserspeicher oder Repository. Das Gateway bindet nur an Loopback. Für Fernzugriff sind dieselbe HTTPS-Origin, ein authentifizierender Reverse Proxy, der Modus `proxy` und ein serverseitiges Proxy-Geheimnis nötig. Der Proxy muss vertrauenswürdige Identitäts- und Geheimnis-Header überschreiben. Den lokalen Modus nicht über einen öffentlichen Tunnel freigeben.
- Die Antwort ist ein reiner Textvorschlag zur Prüfung und verändert das Dokument nicht automatisch. Größe, Häufigkeit, Parallelität und Laufzeit sind begrenzt. Abbrechen garantiert keinen Abrechnungsstopp beim Anbieter. Die vollständige Bereitstellungsspezifikation steht oben auf Englisch.
- Tests verwenden ausschließlich einen simulierten Anbieter. Echte Aufrufe, kostenpflichtige Generierung und produktive Authentifizierung sind unbestätigt; diese vor Verwendung echter Dokumente selbst prüfen.
