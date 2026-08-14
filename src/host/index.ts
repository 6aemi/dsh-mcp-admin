/**
 * Host half of dsh-mcp-admin.
 *
 * - Registers the `/mcp` command: reads every profile's configured MCP servers
 *   from `cordis.patch.yml` (so never-connected servers appear) and annotates
 *   each with live tool count from `ctx.tools` (mcp__ prefix).
 * - Exposes a `TypertRemoteService` (`ctx.remote.mcpAdmin.*`) the browser
 *   client self-mounts, so the settings panel and popup get structured data
 *   without a /command conversation node.
 */

import type { Context } from '@deepseek-ai/cordis'
import { basename } from 'node:path'
import type { CommandDefinition } from '@deepseek-ai/dsh-commands'
import type { ToolSchema } from '@deepseek-ai/dsh-llm'
import {
  listProfiles, readProfile, type ServerDef,
} from './profile-store.ts'
import { McpAdminRemote, readAllServers, syncAll } from './remote.ts'

export const name = 'mcp-admin'
export const inject = ['commands', 'tools']

/** Default export aliases the plugin so any loader interop (default/named) resolves it. */
export default { name, inject, apply }

export function apply(ctx: Context): void {
  const homePath = ctx.get('dshHomePath') as ((...segments: string[]) => string) | undefined
  if (homePath === undefined) {
    ctx.logger.warn('mcp-admin: ctx.dshHomePath unavailable; MCP management disabled')
    return
  }
  const home = homePath()

  // The profile the app is running in: ctx.baseUrl points at the profile dir.
  const currentProfile = ctx.baseUrl
    ? basename(new URL(ctx.baseUrl).pathname.replace(/\/+$/, ''))
    : undefined

  // Live serverName -> tool count, from the current app's loaded MCP clients.
  const live = new Map<string, number>()
  const serverTools = new Map<string, string[]>()
  const refresh = (): void => {
    live.clear()
    serverTools.clear()
    for (const tool of ctx.tools.schemas() as ToolSchema[]) {
      if (tool.name.startsWith('mcp__')) {
        const parts = tool.name.split('__')
        const serverName = parts[1]
        live.set(serverName, (live.get(serverName) ?? 0) + 1)
        const list = serverTools.get(serverName) ?? []
        list.push(parts.slice(2).join('__'))
        serverTools.set(serverName, list)
      }
    }
  }
  refresh()
  ctx.on('tools/change', refresh)

  const command: CommandDefinition = {
    name: 'mcp',
    description: 'Show MCP server status across profiles; /mcp <server> shows one server',
    handler: async (invocation) => {
      const arg = invocation.rawInput.trim()
      const profiles = listProfiles(home)
      if (profiles.length === 0) return { kind: 'success', text: '(no profiles found)' }

      // `/mcp ls` — full server list as JSON with live tool counts (for the UI).
      if (arg === 'ls') {
        const servers = readAllServers(home).map(s => ({
          ...s,
          tools: live.get(s.serverName) ?? 0,
        }))
        return { kind: 'success', text: JSON.stringify(servers) }
      }

      // `/mcp set <json>` — reconcile every profile to the given flat list.
      if (arg.startsWith('set ')) {
        const body = arg.slice(4).trim()
        try {
          const servers = JSON.parse(body) as ServerDef[]
          syncAll(home, servers)
          return { kind: 'success', text: 'ok' }
        } catch (err) {
          return { kind: 'error', text: `invalid JSON: ${err instanceof Error ? err.message : String(err)}` }
        }
      }

      // Drill into one server across all profiles if an arg was given.
      if (arg) {
        const lines: string[] = []
        for (const name of profiles) {
          for (const s of readProfile(home, name).servers) {
            if (s.serverName !== arg) continue
            const count = live.get(s.serverName) ?? 0
            lines.push(`${s.serverName}: ${count} tools${s.disabled ? ' [disabled]' : ''}`)
            for (const t of serverTools.get(s.serverName) ?? []) lines.push(`  - ${t}`)
          }
        }
        return lines.length
          ? { kind: 'success', text: lines.join('\n') }
          : { kind: 'error', text: `no MCP server named "${arg}"` }
      }

      const lines: string[] = []
      for (const name of profiles) {
        const p = readProfile(home, name)
        lines.push(`${name}:`)
        if (p.servers.length === 0) {
          lines.push('  (no MCP servers)')
          continue
        }
        for (const s of p.servers) {
          const count = live.get(s.serverName) ?? 0
          const status = count > 0 ? `${count} tools` : '0 tools (disconnected)'
          lines.push(`  ${s.serverName}: ${status}${s.disabled ? ' [disabled]' : ''}`)
        }
      }
      return { kind: 'success', text: lines.join('\n') }
    },
  }
  ctx.commands.register(command)

  // Structured remote: the host gateway auto-discovers these @Remote methods.
  // The browser client mounts this namespace itself via `ctx.remote.$mount`,
  // then reads/writes through `ctx.remote.mcpAdmin.*` — no command node, no
  // conversation text, no session dependency.
  ctx.effect(() => {
    if (currentProfile === undefined) {
      ctx.logger.warn('mcp-admin: current profile unknown (no ctx.baseUrl); admin remote disabled')
      return
    }
    new McpAdminRemote(
      ctx,
      home,
      currentProfile,
      name => live.get(name) ?? 0,
      name => live.has(name),
    )
  }, 'mcp-admin: structured remote')
}