import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listProfiles, readProfile, upsertServer, setDisabled, removeServer, syncServers, MCP_CLIENT_PLUGIN } from './profile-store.ts'

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

function setup(data: string = SAMPLE): string {
  const root = mkdtempSync(join(tmpdir(), 'mcp-admin-'))
  const profile = join(root, 'profiles', 'web')
  mkdirSync(profile, { recursive: true })
  writeFileSync(join(profile, 'cordis.patch.yml'), data)
  return root
}

test('lists profiles and parses servers + disabled state', () => {
  const root = setup()
  assert.deepEqual(listProfiles(root), ['web'])
  const p = readProfile(root, 'web')
  assert.equal(p.servers.length, 1)
  assert.equal(p.servers[0].serverName, 'engram')
  assert.equal(p.servers[0].transport, 'stdio')
  assert.equal(p.servers[0].disabled, true)
  assert.equal(p.servers[0].command, 'engram')
})

test('upsert adds a new server and preserves comments + existing rows', () => {
  const root = setup('')
  const patchPath = join(root, 'profiles', 'web', 'cordis.patch.yml')
  upsertServer(patchPath, {
    id: 'srv-a',
    config: { serverName: 'alpha', transport: 'stdio', command: 'alpha-mcp' },
  })
  upsertServer(patchPath, {
    id: 'srv-b',
    config: { serverName: 'beta', transport: 'streamable-http', url: 'http://localhost:3000' },
  })
  const p = readProfile(root, 'web')
  assert.deepEqual(p.servers.map(s => s.serverName), ['alpha', 'beta'])
  assert.equal(p.servers[1].url, 'http://localhost:3000')
})

test('upsert edits an existing server config in place', () => {
  const root = setup()
  const patchPath = join(root, 'profiles', 'web', 'cordis.patch.yml')
  upsertServer(patchPath, { id: 'memory-engram', config: { command: 'engram-v2' } })
  const p = readProfile(root, 'web')
  assert.equal(p.servers[0].command, 'engram-v2')
  // disable patch + comment preserved
  assert.equal(p.servers[0].disabled, true)
  assert.match(readFileSync(patchPath, 'utf8'), /# user mcp layer/)
})

test('setDisabled toggles the sibling patch', () => {
  const root = setup()
  const patchPath = join(root, 'profiles', 'web', 'cordis.patch.yml')
  setDisabled(patchPath, 'memory-engram', false) // enable
  assert.equal(readProfile(root, 'web').servers[0].disabled, false)
  setDisabled(patchPath, 'memory-engram', true) // disable again
  assert.equal(readProfile(root, 'web').servers[0].disabled, true)
})

test('removeServer drops insert row and disable patch', () => {
  const root = setup()
  const patchPath = join(root, 'profiles', 'web', 'cordis.patch.yml')
  removeServer(patchPath, 'memory-engram')
  assert.equal(readProfile(root, 'web').servers.length, 0)
  const text = readFileSync(patchPath, 'utf8')
  assert.ok(!text.includes('engram'))
  assert.ok(!text.includes('disabled: true'))
})

test('round-trips a stdio server with args', () => {
  const root = setup('')
  const patchPath = join(root, 'profiles', 'web', 'cordis.patch.yml')
  upsertServer(patchPath, {
    id: 'srv',
    config: { serverName: 'pick', transport: 'stdio', command: 'pick-mcp', args: ['serve', '--x'] },
  })
  const p = readProfile(root, 'web')
  assert.equal(p.servers[0].serverName, 'pick')
  assert.equal(MCP_CLIENT_PLUGIN, '@deepseek-ai/dsh-mcp-client')
})

test('syncServers reconciles add/remove/disable and preserves non-MCP content', () => {
  const root = setup(SAMPLE) // has memory-engram (disabled)
  const patchPath = join(root, 'profiles', 'web', 'cordis.patch.yml')
  // Append a genuinely non-MCP insert (different plugin name) to ensure it survives.
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

test('syncServers deletes cleared headers and skips a no-op write', () => {
  const root = setup('')
  const patchPath = join(root, 'profiles', 'web', 'cordis.patch.yml')
  syncServers(patchPath, [{
    id: 'srv', profile: 'web', serverName: 'http', transport: 'streamable-http',
    url: 'http://x', headers: { Authorization: 'Bearer t' }, disabled: false,
  }])
  const before = readFileSync(patchPath, 'utf8')
  assert.match(before, /Authorization/)

  // Editing the server with headers cleared must REMOVE the YAML key.
  syncServers(patchPath, [{
    id: 'srv', profile: 'web', serverName: 'http', transport: 'streamable-http',
    url: 'http://x', disabled: false,
  }])
  const cleared = readFileSync(patchPath, 'utf8')
  assert.ok(!cleared.includes('Authorization'))

  // Same target again → document is byte-identical → no write at all.
  const after = readFileSync(patchPath, 'utf8')
  syncServers(patchPath, [{
    id: 'srv', profile: 'web', serverName: 'http', transport: 'streamable-http',
    url: 'http://x', disabled: false,
  }])
  assert.equal(readFileSync(patchPath, 'utf8'), after)
})