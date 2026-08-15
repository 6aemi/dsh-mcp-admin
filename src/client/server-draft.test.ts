import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createEmptyDraft,
  toDraft,
  toCleanServer,
  validateDraft,
  serverState,
  serverStatusLabel,
  connectedCount,
} from './server-draft.ts'

test('createEmptyDraft returns a clean blank stdio draft', () => {
  const draft = createEmptyDraft('web')
  assert.equal(draft.profile, 'web')
  assert.equal(draft.transport, 'stdio')
  assert.equal(draft.disabled, false)
  assert.equal(draft.id, '')
  assert.equal(draft.serverName, '')
  assert.equal(draft.command, '')
})

test('toDraft populates multiline args and headers text', () => {
  const draft = toDraft({
    id: 'srv-1',
    profile: 'web',
    serverName: 'alpha',
    transport: 'stdio',
    command: 'bin',
    args: ['foo', 'bar'],
    headers: { Authorization: 'Bearer xxx', 'X-Custom': 'val' },
    disabled: false,
  })

  assert.equal(draft.argsText, 'foo\nbar')
  assert.equal(draft.headersText, 'Authorization=Bearer xxx\nX-Custom=val')
})

test('toCleanServer parses multiline text and strips transient fields', () => {
  const clean = toCleanServer({
    id: 'srv-1',
    profile: 'web',
    serverName: 'alpha',
    transport: 'streamable-http',
    url: 'http://localhost:3000',
    disabled: false,
    argsText: '  line1 \n\n line2 \n ',
    headersText: 'Auth=Bearer tok\nKey = Value with = sign\n\n',
    tools: 5,
    loaded: true,
    active: true,
  })

  assert.deepEqual(clean.args, ['line1', 'line2'])
  assert.deepEqual(clean.headers, {
    Auth: 'Bearer tok',
    Key: 'Value with = sign',
  })
  // Transient fields stripped
  assert.equal('argsText' in clean, false)
  assert.equal('headersText' in clean, false)
  assert.equal('tools' in clean, false)
  assert.equal('loaded' in clean, false)
  assert.equal('active' in clean, false)
})

test('toCleanServer omits empty args and headers from result object', () => {
  const clean = toCleanServer({
    id: 'srv-1',
    profile: 'web',
    serverName: 'alpha',
    transport: 'stdio',
    command: 'run',
    disabled: false,
    argsText: '   \n  \n',
    headersText: '',
  })

  assert.equal('args' in clean, false)
  assert.equal('headers' in clean, false)
})

test('validateDraft enforces validation rules for new and existing servers', () => {
  // New server requires id
  const emptyNew = validateDraft(createEmptyDraft(), true)
  assert.equal(emptyNew.valid, false)
  assert.match(emptyNew.error!, /needs an id/)

  // Missing serverName
  const missingName = validateDraft({
    id: 's1',
    profile: 'web',
    serverName: '',
    transport: 'stdio',
    command: 'cmd',
    disabled: false,
  })
  assert.equal(missingName.valid, false)
  assert.match(missingName.error!, /needs a serverName/)

  // Stdio requires command
  const missingCmd = validateDraft({
    id: 's1',
    profile: 'web',
    serverName: 'srv',
    transport: 'stdio',
    command: '  ',
    disabled: false,
  })
  assert.equal(missingCmd.valid, false)
  assert.match(missingCmd.error!, /needs a command/)

  // Http requires url
  const missingUrl = validateDraft({
    id: 's1',
    profile: 'web',
    serverName: 'srv',
    transport: 'streamable-http',
    url: '  ',
    disabled: false,
  })
  assert.equal(missingUrl.valid, false)
  assert.match(missingUrl.error!, /needs a url/)

  // Valid stdio
  assert.equal(validateDraft({
    id: 's1',
    profile: 'web',
    serverName: 'srv',
    transport: 'stdio',
    command: 'npx run',
    disabled: false,
  }).valid, true)
})

test('serverState and serverStatusLabel categorize connection health', () => {
  // Disabled
  assert.equal(serverState({ disabled: true }), 'warning')
  assert.equal(serverStatusLabel({ disabled: true }), 'disabled')

  // Reloading / Pending (active = false)
  assert.equal(serverState({ disabled: false, active: false }), 'ongoing')
  assert.equal(serverStatusLabel({ disabled: false, active: false }), 'disconnected')

  // Connected (active = true, tools > 0)
  assert.equal(serverState({ disabled: false, active: true, tools: 3 }), 'done')
  assert.equal(serverStatusLabel({ disabled: false, active: true, tools: 3 }), 'connected')

  // Connection failed (active = true, tools = 0)
  assert.equal(serverState({ disabled: false, active: true, tools: 0 }), 'error')
  assert.equal(serverStatusLabel({ disabled: false, active: true, tools: 0 }), 'connection failed')
})

test('connectedCount tallies only enabled servers with tools > 0', () => {
  const count = connectedCount([
    { disabled: false, tools: 2 },
    { disabled: true, tools: 5 }, // disabled, not counted
    { disabled: false, tools: 0 }, // 0 tools, not counted
    { disabled: false, tools: 1 },
  ])
  assert.equal(count, 2)
})
