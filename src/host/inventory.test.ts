import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ServerInventory } from './inventory.ts'

const SAMPLE_PATCH = `# user mcp layer
- insert:
    - id: srv-connected
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: connected-srv
        transport: stdio
        command: conn-bin
    - id: srv-failed
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: failed-srv
        transport: stdio
        command: fail-bin
    - id: srv-unloaded
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: unloaded-srv
        transport: streamable-http
        url: http://example.com/mcp
    - id: srv-disabled
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: disabled-srv
        transport: stdio
        command: dis-bin
- id: srv-disabled
  disabled: true
`

function setupInventory(tools: { name: string }[] = [], activeNames: string[] = []): ServerInventory {
  const root = mkdtempSync(join(tmpdir(), 'mcp-inv-test-'))
  const profileDir = join(root, 'profiles', 'web')
  mkdirSync(profileDir, { recursive: true })
  writeFileSync(join(profileDir, 'cordis.patch.yml'), SAMPLE_PATCH)

  return new ServerInventory({
    dshHome: root,
    profile: 'web',
    getTools: () => tools,
    getActiveServerNames: () => new Set(activeNames),
  })
}

test('ServerInventory.list derives all 4 connection health states', () => {
  const tools = [
    { name: 'mcp__connected-srv__fetch' },
    { name: 'mcp__connected-srv__query' },
  ]
  // failed-srv has an active fiber in registry, but 0 tools
  const activeNames = ['connected-srv', 'failed-srv']

  const inv = setupInventory(tools, activeNames)
  const list = inv.list()

  assert.equal(list.length, 4)

  const connected = list.find(s => s.serverName === 'connected-srv')!
  assert.equal(connected.status, 'connected')
  assert.equal(connected.toolCount, 2)
  assert.deepEqual(connected.tools, ['fetch', 'query'])
  assert.equal(connected.loaded, true)
  assert.equal(connected.active, true)

  const failed = list.find(s => s.serverName === 'failed-srv')!
  assert.equal(failed.status, 'error')
  assert.equal(failed.toolCount, 0)
  assert.deepEqual(failed.tools, [])
  assert.equal(failed.loaded, false)
  assert.equal(failed.active, true)

  const unloaded = list.find(s => s.serverName === 'unloaded-srv')!
  assert.equal(unloaded.status, 'unloaded')
  assert.equal(unloaded.toolCount, 0)
  assert.equal(unloaded.loaded, false)
  assert.equal(unloaded.active, false)

  const disabled = list.find(s => s.serverName === 'disabled-srv')!
  assert.equal(disabled.status, 'disabled')
  assert.equal(disabled.disabled, true)
})

test('ServerInventory.get retrieves a single server or undefined', () => {
  const inv = setupInventory([], [])
  assert.equal(inv.get('connected-srv')?.serverName, 'connected-srv')
  assert.equal(inv.get('non-existent'), undefined)
})

test('ServerInventory formats summary and drilldown details', () => {
  const tools = [
    { name: 'mcp__connected-srv__ping' },
  ]
  const inv = setupInventory(tools, ['connected-srv', 'failed-srv'])

  const summary = inv.formatSummary()
  assert.match(summary, /web:/)
  assert.match(summary, /connected-srv: 1 tools/)
  assert.match(summary, /failed-srv: 0 tools \(disconnected\)/)
  assert.match(summary, /disabled-srv: 0 tools \[disabled\]/)

  const detailOk = inv.formatDetail('connected-srv')
  assert.equal(detailOk.ok, true)
  assert.match(detailOk.text, /connected-srv: 1 tools/)
  assert.match(detailOk.text, /- ping/)

  const detailErr = inv.formatDetail('non-existent')
  assert.equal(detailErr.ok, false)
})

test('ServerInventory.sync reconciles servers and drops incomplete drafts', () => {
  const inv = setupInventory([], [])
  inv.sync([
    { id: 'srv-new', profile: 'web', serverName: 'new-srv', transport: 'stdio', command: 'new-bin', disabled: false },
    // incomplete row: missing command
    { id: 'srv-draft', profile: 'web', serverName: 'draft-srv', transport: 'stdio', command: '', disabled: false },
  ])

  const updated = inv.list()
  assert.equal(updated.length, 1)
  assert.equal(updated[0].serverName, 'new-srv')
})
