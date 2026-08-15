/**
 * Profile discovery and cordis.patch.yml read/reconcile for MCP server management.
 *
 * A profile is `$DSH_HOME/profiles/<name>/cordis.patch.yml` — a top-level YAML
 * array of loader patch entries. MCP servers are `- insert: [...]` entries whose
 * `name` is `@deepseek-ai/dsh-mcp-client`; a server is disabled by a sibling
 * top-level patch `- { id, disabled: true }`.
 *
 * All mutations reconcile the WHOLE document in memory and write ONCE via
 * `syncServers`: the patch file is watched by dsh HMR, so a single atomic write
 * prevents multi-reload process churning.
 *
 * Editing uses the `yaml` package's node API so untouched parts (comments,
 * non-MCP insert rows) round-trip unchanged.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { parseDocument, YAMLMap, YAMLSeq, Scalar, type Document, isMap, isSeq, isScalar } from 'yaml'

export const MCP_CLIENT_PLUGIN = '@deepseek-ai/dsh-mcp-client'
export const PATCH_FILENAME = 'cordis.patch.yml'

/** A configured MCP server definition stored in the profile's patch file. */
export interface ServerDef {
  id: string
  profile: string
  serverName: string
  transport: 'stdio' | 'streamable-http'
  command?: string
  url?: string
  args?: string[]
  headers?: Record<string, string>
  disabled: boolean
}

/** A profile and its configured MCP servers. */
export interface Profile {
  name: string
  patchPath: string
  servers: ServerDef[]
}

/** Read one profile's MCP server configurations from disk. */
export function readProfile(dshHome: string, name: string): Profile {
  const patchPath = join(dshHome, 'profiles', name, PATCH_FILENAME)
  const doc = existsSync(patchPath)
    ? parseDocument(readFileSync(patchPath, 'utf8'))
    : parseDocument('[]\n')
  return { name, patchPath, servers: readServers(doc, name) }
}

/**
 * Reconcile a profile's patch file to match the target server list (by id):
 * upsert present servers, drop absent ones, set disabled state. Non-MCP
 * patch content and comments are preserved.
 *
 * Writes ONCE per save, and `writeIfChanged` skips disk writes entirely when
 * the serialized result is byte-identical (a no-op save triggers no HMR reload).
 */
export function syncServers(patchPath: string, target: ServerDef[]): void {
  const doc = loadDoc(patchPath)
  const root = ensureSeq(doc)
  const currentIds = new Set(readServers(doc, '').map(s => s.id))
  const targetIds = new Set(target.map(s => s.id))

  // Upsert each target server into its insert entry (create if missing).
  for (const s of target) {
    const entry = findInsertEntry(doc, s.id)
    if (entry) {
      const cfg = entry.get('config')
      const map = isMap(cfg) ? cfg : null
      if (map) setConfigKeys(map, toConfig(s))
    } else {
      const patch = newMap()
      const list = newSeq()
      const row = newMap()
      row.add({ key: 'id', value: s.id })
      row.add({ key: 'name', value: MCP_CLIENT_PLUGIN })
      row.add({ key: 'config', value: toYaml(toConfig(s)) })
      list.add(row)
      patch.add({ key: 'insert', value: list })
      root.add(patch)
    }
  }

  // Disable/enable via a sibling `{id, disabled:true}` patch row.
  for (const s of target) {
    const idx = root.items.findIndex(p => isMap(p) && scalarStr(p.get('id')) === s.id && p.get('insert') === undefined)
    if (s.disabled) {
      if (idx < 0) {
        const patch = newMap()
        patch.add({ key: 'id', value: s.id })
        patch.add({ key: 'disabled', value: true })
        root.add(patch)
      }
    } else if (idx >= 0) {
      root.items.splice(idx, 1)
    }
  }

  // Permanently remove servers absent from the target.
  for (const id of currentIds) {
    if (targetIds.has(id)) continue
    root.items = root.items.filter(p => !(isMap(p) && scalarStr(p.get('id')) === id && p.get('insert') === undefined))
    for (const item of root.items) {
      if (!isMap(item)) continue
      const insert = item.get('insert')
      if (isSeq(insert)) insert.items = insert.items.filter(e => !(isMap(e) && scalarStr(e.get('id')) === id))
    }
  }

  writeIfChanged(patchPath, doc)
}

// ---- Internal YAML AST extraction & reconciliation ----

function loadDoc(patchPath: string): Document {
  return existsSync(patchPath)
    ? parseDocument(readFileSync(patchPath, 'utf8'))
    : parseDocument('[]\n')
}

function readServers(doc: Document, profile: string): ServerDef[] {
  const root = doc.contents
  if (!isSeq(root)) return []
  const disabled = new Set<string>()
  const servers: ServerDef[] = []
  for (const item of root.items) {
    if (!isMap(item)) continue
    const id = scalarStr(item.get('id'))
    if (id && item.get('disabled') === true) disabled.add(id)
  }
  for (const item of root.items) {
    if (!isMap(item)) continue
    const insert = item.get('insert')
    if (!isSeq(insert)) continue
    for (const entry of insert.items) {
      if (!isMap(entry)) continue
      if (scalarStr(entry.get('name')) !== MCP_CLIENT_PLUGIN) continue
      const id = scalarStr(entry.get('id'))
      const cfg = entry.get('config')
      const config = isMap(cfg) ? cfg : undefined
      const serverName = config ? scalarStr(config.get('serverName')) : ''
      const transport = config ? scalarStr(config.get('transport')) : ''
      servers.push({
        id,
        profile,
        serverName,
        transport: transport === 'streamable-http' ? 'streamable-http' : 'stdio',
        command: config ? looseStr(config.get('command')) : undefined,
        url: config ? looseStr(config.get('url')) : undefined,
        args: config ? looseStrArray(config.get('args')) : undefined,
        headers: config ? looseStrRecord(config.get('headers')) : undefined,
        disabled: id ? disabled.has(id) : false,
      })
    }
  }
  return servers
}

/** Config keys the admin surface owns; every other key on the entry survives. */
const CONFIG_KEYS = ['serverName', 'transport', 'command', 'url', 'args', 'headers'] as const

function toConfig(s: ServerDef): Record<string, unknown> {
  return {
    serverName: s.serverName,
    transport: s.transport,
    ...(s.command !== undefined ? { command: s.command } : {}),
    ...(s.url !== undefined ? { url: s.url } : {}),
    ...(s.args !== undefined ? { args: s.args } : {}),
    ...(s.headers !== undefined ? { headers: s.headers } : {}),
  }
}

/** Set every owned key to its target value, deleting it when absent. */
function setConfigKeys(map: YAMLMap, config: Record<string, unknown>): void {
  for (const key of CONFIG_KEYS) {
    if (key in config) map.set(key, config[key])
    else map.delete(key)
  }
}

/** Write only when the serialized document actually differs from disk. */
function writeIfChanged(patchPath: string, doc: Document): void {
  const next = doc.toString()
  const prev = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : undefined
  if (prev === next) return
  writeFileSync(patchPath, next)
}

function ensureSeq(doc: Document): YAMLSeq {
  if (!isSeq(doc.contents)) doc.contents = newSeq()
  return doc.contents as YAMLSeq
}

function newMap(): YAMLMap {
  return new YAMLMap()
}

function newSeq(): YAMLSeq {
  return new YAMLSeq()
}

function toYaml(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toYaml)
  if (value !== null && typeof value === 'object') {
    const m = newMap()
    for (const [k, v] of Object.entries(value)) m.add({ key: k, value: toYaml(v) })
    return m
  }
  return new Scalar(value)
}

function findInsertEntry(doc: Document, id: string): YAMLMap | undefined {
  const root = doc.contents
  if (!isSeq(root)) return undefined
  for (const item of root.items) {
    if (!isMap(item)) continue
    const insert = item.get('insert')
    if (!isSeq(insert)) continue
    for (const entry of insert.items) {
      if (isMap(entry) && scalarStr(entry.get('id')) === id) return entry
    }
  }
  return undefined
}

function scalarStr(v: unknown): string {
  return isScalar(v) && typeof v.value === 'string' ? v.value : String(v ?? '')
}

function looseStr(v: unknown): string | undefined {
  if (isScalar(v) && typeof v.value === 'string') return v.value
  return typeof v === 'string' ? v : undefined
}

function looseStrArray(v: unknown): string[] | undefined {
  if (!isSeq(v)) return undefined
  const out: string[] = []
  for (const item of v.items) {
    const s = isScalar(item) && typeof item.value === 'string' ? item.value : undefined
    if (s !== undefined) out.push(s)
  }
  return out.length > 0 ? out : undefined
}

function looseStrRecord(v: unknown): Record<string, string> | undefined {
  if (!isMap(v)) return undefined
  const out: Record<string, string> = {}
  for (const item of v.items) {
    const key = isScalar(item.key) ? String(item.key.value ?? '') : ''
    const s = isScalar(item.value) && typeof item.value.value === 'string' ? item.value.value : ''
    if (key) out[key] = s
  }
  return Object.keys(out).length > 0 ? out : undefined
}