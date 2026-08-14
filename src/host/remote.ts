/**
 * Structured Host→Client remote for MCP admin.
 *
 * A `TypertRemoteService` marks its `@Remote` methods as wire endpoints the
 * Host gateway auto-discovers (via src-claims) without a generated artifact,
 * so this half needs no framework change. The value returned is structured
 * JSON (`ServerView[]`), not text the client must parse — and critically, a
 * remote invocation does NOT create a `/command` conversation node the way
 * `remote.commands.execute` does, so popping the picker leaves no chat text.
 *
 * The client half reaches these as `ctx.remote.mcpAdmin.*` after it mounts
 * this namespace itself via `ctx.remote.$mount` (no harness change).
 */

import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { listProfiles, readProfile, syncServers, type McpServer, type ServerDef } from './profile-store.ts'

/** A server plus its live tool count and load state (from the app's loaded MCP clients). */
export interface ServerView extends ServerDef {
  tools: number
  /** True when the app has an mcp-client instance running for this serverName. */
  loaded: boolean
  /**
   * True when an mcp-client plugin instance exists for this serverName (even if
   * it has zero tools — connection failed). Distinct from `loaded` so the UI
   * can show error (instance alive, no tools) instead of a forever-pending dot.
   */
  active: boolean
}

/** Wire namespace served under `ctx.remote.mcpAdmin`. */
export class McpAdminRemote extends TypertRemoteService {
  private readonly home: string
  private readonly currentProfile: string
  private readonly toolCount: (serverName: string) => number
  private readonly loaded: (serverName: string) => boolean

  constructor(
    ctx: Context,
    home: string,
    currentProfile: string,
    toolCount: (serverName: string) => number,
    loaded: (serverName: string) => boolean,
  ) {
    super(ctx, 'mcpAdmin')
    this.home = home
    this.currentProfile = currentProfile
    this.toolCount = toolCount
    this.loaded = loaded
  }

  /** The current profile's MCP servers as structured defs, with live tool counts. */
  @Remote
  list(): ServerView[] {
    const active = activeMcpClients(this.ctx)
    return readProfile(this.home, this.currentProfile).servers
      .map(s => ({
        ...toDef(this.currentProfile, s),
        tools: this.toolCount(s.serverName),
        loaded: this.loaded(s.serverName),
        active: active.has(s.serverName),
      }))
  }

  /** Reconcile the current profile's patch file to the given server list. */
  @Remote
  set(servers: ServerDef[]): { ok: boolean } {
    // Drop incomplete rows so a half-filled draft can never break dsh boot:
    // stdio needs a command, streamable-http needs a url, both need a name.
    const valid = servers.filter(s =>
      s.serverName.trim() !== ''
      && (s.transport === 'stdio' ? (s.command ?? '').trim() !== '' : (s.url ?? '').trim() !== ''))
    const normalized = valid.map(s => ({ ...s, profile: this.currentProfile }))
    const patchPath = readProfile(this.home, this.currentProfile).patchPath
    syncServers(patchPath, normalized)
    return { ok: true }
  }
}

/** Read every profile's configured servers as a flat ServerDef list. */
export function readAllServers(home: string): ServerDef[] {
  const out: ServerDef[] = []
  for (const name of listProfiles(home)) {
    for (const s of readProfile(home, name).servers) out.push(toDef(name, s))
  }
  return out
}

/**
 * serverName of every live mcp-client instance in this app, from the Cordis
 * registry (each mcp-client fiber carries its validated config). An instance
 * that failed to connect still registers its fiber (unless failOnStartupError),
 * so `active` and `loaded` (has tools) diverge exactly for dead connections.
 */
function activeMcpClients(ctx: Context): Set<string> {
  const names = new Set<string>()
  for (const [, runtime] of ctx.registry.entries()) {
    if (runtime.name !== 'mcp-client') continue
    for (const fiber of runtime.fibers) {
      const serverName = (fiber.config as { serverName?: string } | undefined)?.serverName
      if (serverName) names.add(serverName)
    }
  }
  return names
}

function toDef(profile: string, s: McpServer): ServerDef {
  return {
    id: s.id,
    profile,
    serverName: s.serverName,
    transport: s.transport,
    ...(s.command !== undefined ? { command: s.command } : {}),
    ...(s.url !== undefined ? { url: s.url } : {}),
    ...(s.args !== undefined ? { args: s.args } : {}),
    ...(s.headers !== undefined ? { headers: s.headers } : {}),
    disabled: s.disabled,
  }
}

/** Reconcile every profile's patch file against the flat target list. */
export function syncAll(home: string, servers: ServerDef[]): void {
  const byProfile = new Map<string, ServerDef[]>()
  for (const s of servers) {
    const list = byProfile.get(s.profile) ?? []
    list.push(s)
    byProfile.set(s.profile, list)
  }
  const profiles = new Set([...listProfiles(home), ...byProfile.keys()])
  for (const name of profiles) {
    const target = byProfile.get(name) ?? []
    syncServers(readProfile(home, name).patchPath, target)
  }
}