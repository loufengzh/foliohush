import { createAgentServer, loadConfig } from './agent.mjs'

try {
  const config = loadConfig()
  const server = createAgentServer(config)
  server.on('error', () => {
    console.error('Foliohush gateway could not start. Check the server configuration and port.')
    process.exitCode = 1
  })
  server.listen(config.port, config.host, () => {
    console.log(`Foliohush gateway listening on loopback port ${config.port}.`)
    console.log(
      config.ready ? 'Provider configuration present.' : 'Provider configuration missing.',
    )
  })
  const shutdown = () => {
    server.close()
    server.closeAllConnections()
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
} catch {
  console.error('Foliohush gateway configuration is invalid. See docs/AI_AGENT.md.')
  process.exitCode = 1
}
