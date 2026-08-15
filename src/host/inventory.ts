/**
 * ServerInventory — Authoritative domain inventory of MCP servers,
 * live tools, and connection health states for the active profile.
 *
 * Encapsulates:
 * - cordis.patch.yml YAML configuration parsing and atomic reconciliation.
 * - Live `mcp__` tool schemas filtering and tool name indexing.
 * - Cordis runtime registry fiber inspection for instance health detection.
 */

import type { ServerDef } from './profile-store.ts'
import { readProfile, syncServers } from './profile-store.ts'

export type ConnectionStatus = 'connected' | 'error' | 'disabled' | 'unloaded'

/** Rich domain representation of an MCP server with live health and tools. */
export interface InventoryServerEntry extends ServerDef {
  /** High-level connection health status. */
  status: ConnectionStatus
  /** List of tool names (without the `mcp__<serverName>__` prefix). */
  tools: string[]
  /** Numeric count of available tools. */
  toolCount: number
  /** True when the app has an active mcp-client instance providing tools. */
  loaded: boolean
  /** True when an mcp-client plugin instance exists in the registry (even with 0 tools). */
  active: boolean
}

export interface InventoryOptions {
  dshHome: string
  profile: string
  getTools: () => { name: string }[]
  getActiveServerNames: () => Set<string>
}

export class ServerInventory {
  readonly dshHome: string
  readonly profile: string
  private readonly getTools: () => { name: string }[]
  private readonly getActiveServerNames: () => Set<string>

  constructor(options: InventoryOptions) {
    this.dshHome = options.dshHome
    this.profile = options.profile
    this.getTools = options.getTools
    this.getActiveServerNames = options.getActiveServerNames
  }

  get patchPath(): string {
    return readProfile(this.dshHome, this.profile).patchPath
  }

  /**
   * List all configured MCP servers for the current profile, annotated
   * with live tools and derived connection status.
   */
  list(): InventoryServerEntry[] {
    const configured = readProfile(this.dshHome, this.profile).servers
    const activeNames = this.getActiveServerNames()
    const toolsByServer = this.collectLiveTools()

    return configured.map(s => {
      const serverTools = toolsByServer.get(s.serverName) ?? []
      const toolCount = serverTools.length
      const active = activeNames.has(s.serverName)
      const loaded = toolCount > 0

      let status: ConnectionStatus
      if (s.disabled) {
        status = 'disabled'
      } else if (loaded) {
        status = 'connected'
      } else if (active) {
        status = 'error' // Instance alive in registry but has 0 tools (connection failed)
      } else {
        status = 'unloaded'
      }

      return {
        id: s.id,
        profile: this.profile,
        serverName: s.serverName,
        transport: s.transport,
        ...(s.command !== undefined ? { command: s.command } : {}),
        ...(s.url !== undefined ? { url: s.url } : {}),
        ...(s.args !== undefined ? { args: s.args } : {}),
        ...(s.headers !== undefined ? { headers: s.headers } : {}),
        disabled: s.disabled,
        status,
        tools: serverTools,
        toolCount,
        loaded,
        active,
      }
    })
  }

  /** Retrieve a single server entry by serverName. */
  get(serverName: string): InventoryServerEntry | undefined {
    return this.list().find(s => s.serverName === serverName)
  }

  /**
   * Reconcile the current profile's patch file to the given server list.
   * Drops incomplete drafts to avoid breaking dsh boot.
   */
  sync(servers: ServerDef[]): { ok: boolean } {
    const valid = servers.filter(s =>
      s.serverName.trim() !== ''
      && (s.transport === 'stdio' ? (s.command ?? '').trim() !== '' : (s.url ?? '').trim() !== ''),
    )
    const normalized = valid.map(s => ({ ...s, profile: this.profile }))
    syncServers(this.patchPath, normalized)
    return { ok: true }
  }

  /** Render plain-text summary of all servers for `/mcp` command. */
  formatSummary(): string {
    const entries = this.list()
    if (entries.length === 0) return `${this.profile}:\n  (no MCP servers)`

    const lines: string[] = [`${this.profile}:`]
    for (const s of entries) {
      const statusText = s.status === 'connected'
        ? `${s.toolCount} tools`
        : s.status === 'disabled'
          ? '0 tools'
          : '0 tools (disconnected)'
      lines.push(`  ${s.serverName}: ${statusText}${s.disabled ? ' [disabled]' : ''}`)
    }
    return lines.join('\n')
  }

  /** Render plain-text detail for `/mcp <serverName>`. */
  formatDetail(serverName: string): { ok: boolean; text: string } {
    const entry = this.get(serverName)
    if (!entry) {
      return { ok: false, text: `no MCP server named "${serverName}" in profile "${this.profile}"` }
    }

    const lines: string[] = [
      `${entry.serverName}: ${entry.toolCount} tools${entry.disabled ? ' [disabled]' : ''}`,
    ]
    for (const tool of entry.tools) {
      lines.push(`  - ${tool}`)
    }
    return { ok: true, text: lines.join('\n') }
  }

  /** Index live tools from `ctx.tools` by serverName. */
  private collectLiveTools(): Map<string, string[]> {
    const map = new Map<string, string[]>()
    for (const tool of this.getTools()) {
      if (tool.name.startsWith('mcp__')) {
        const parts = tool.name.split('__')
        const serverName = parts[1]
        const toolName = parts.slice(2).join('__')
        const list = map.get(serverName) ?? []
        list.push(toolName)
        map.set(serverName, list)
      }
    }
    return map
  }
}
