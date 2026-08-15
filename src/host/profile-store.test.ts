import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readProfile, syncServers, MCP_CLIENT_PLUGIN } from './profile-store.ts'

const SAMPLE = `# user mcp layer
- insert:
    - id: memory-engram
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: engram
        transport: stdio
        command: engram
        args: [mcp]
        cwd: !!js process.cwd()
- id: memory-engram
  disabled: true
`

function setup(data: string = SAMPLE): { root: string; patchPath: string } {
  const root = mkdtempSync(join(tmpdir(), 'mcp-admin-store-'))
  const profileDir = join(root, 'profiles', 'web')
  mkdirSync(profileDir, { recursive: true })
  const patchPath = join(profileDir, 'cordis.patch.yml')
  writeFileSync(patchPath, data)
  return { root, patchPath }
}

test('readProfile parses servers, transport, and disabled state', () => {
  const { root } = setup()
  const p = readProfile(root, 'web')
  assert.equal(p.name, 'web')
  assert.equal(p.servers.length, 1)
  assert.equal(p.servers[0].serverName, 'engram')
  assert.equal(p.servers[0].transport, 'stdio')
  assert.equal(p.servers[0].disabled, true)
  assert.equal(p.servers[0].command, 'engram')
  assert.deepEqual(p.servers[0].args, ['mcp'])
  assert.equal(MCP_CLIENT_PLUGIN, '@deepseek-ai/dsh-mcp-client')
})

test('syncServers adds new servers and preserves comments + existing rows', () => {
  const { root, patchPath } = setup('')
  syncServers(patchPath, [
    { id: 'srv-a', profile: 'web', serverName: 'alpha', transport: 'stdio', command: 'alpha-mcp', disabled: false },
    { id: 'srv-b', profile: 'web', serverName: 'beta', transport: 'streamable-http', url: 'http://localhost:3000', disabled: false },
  ])
  const p = readProfile(root, 'web')
  assert.deepEqual(p.servers.map(s => s.serverName), ['alpha', 'beta'])
  assert.equal(p.servers[1].url, 'http://localhost:3000')
})

test('syncServers edits existing server config in place and preserves comments', () => {
  const { root, patchPath } = setup(SAMPLE)
  syncServers(patchPath, [
    { id: 'memory-engram', profile: 'web', serverName: 'engram', transport: 'stdio', command: 'engram-v2', disabled: true },
  ])
  const p = readProfile(root, 'web')
  assert.equal(p.servers[0].command, 'engram-v2')
  assert.equal(p.servers[0].disabled, true)
  assert.match(readFileSync(patchPath, 'utf8'), /# user mcp layer/)
})

test('syncServers toggles disabled state via sibling patch', () => {
  const { root, patchPath } = setup(SAMPLE)
  // Enable
  syncServers(patchPath, [
    { id: 'memory-engram', profile: 'web', serverName: 'engram', transport: 'stdio', command: 'engram', disabled: false },
  ])
  assert.equal(readProfile(root, 'web').servers[0].disabled, false)

  // Disable again
  syncServers(patchPath, [
    { id: 'memory-engram', profile: 'web', serverName: 'engram', transport: 'stdio', command: 'engram', disabled: true },
  ])
  assert.equal(readProfile(root, 'web').servers[0].disabled, true)
})

test('syncServers drops absent servers and their disable patches', () => {
  const { root, patchPath } = setup(SAMPLE)
  syncServers(patchPath, [])
  const p = readProfile(root, 'web')
  assert.equal(p.servers.length, 0)
  const text = readFileSync(patchPath, 'utf8')
  assert.ok(!text.includes('engram'))
  assert.ok(!text.includes('disabled: true'))
})

test('syncServers preserves non-MCP patch content and comments during reconciliation', () => {
  const { root, patchPath } = setup(SAMPLE)
  writeFileSync(patchPath, readFileSync(patchPath, 'utf8') + `- insert:
    - id: some-other-plugin
      name: 'some-other-package'
      config:
        foo: bar
`)
  syncServers(patchPath, [
    { id: 'memory-engram', profile: 'web', serverName: 'engram', transport: 'stdio', command: 'engram', disabled: false },
    { id: 'srv-b', profile: 'web', serverName: 'beta', transport: 'streamable-http', url: 'http://b', disabled: true },
  ])
  const p = readProfile(root, 'web')
  assert.deepEqual(p.servers.map(s => s.serverName), ['engram', 'beta'])
  assert.equal(p.servers[0].disabled, false) // re-enabled
  assert.equal(p.servers[1].disabled, true)  // newly added + disabled
  const text = readFileSync(patchPath, 'utf8')
  assert.ok(text.includes('# user mcp layer')) // comment preserved
  assert.ok(text.includes('some-other-plugin')) // non-MCP insert preserved
})

test('syncServers deletes cleared headers and skips no-op byte-identical writes', () => {
  const { patchPath } = setup('')
  syncServers(patchPath, [{
    id: 'srv', profile: 'web', serverName: 'http', transport: 'streamable-http',
    url: 'http://x', headers: { Authorization: 'Bearer t' }, disabled: false,
  }])
  const before = readFileSync(patchPath, 'utf8')
  assert.match(before, /Authorization/)

  // Editing with headers cleared must REMOVE the YAML key.
  syncServers(patchPath, [{
    id: 'srv', profile: 'web', serverName: 'http', transport: 'streamable-http',
    url: 'http://x', disabled: false,
  }])
  const cleared = readFileSync(patchPath, 'utf8')
  assert.ok(!cleared.includes('Authorization'))

  // Same target again → document is byte-identical → no write at all.
  syncServers(patchPath, [{
    id: 'srv', profile: 'web', serverName: 'http', transport: 'streamable-http',
    url: 'http://x', disabled: false,
  }])
  assert.equal(readFileSync(patchPath, 'utf8'), cleared)
})