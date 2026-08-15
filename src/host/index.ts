/**
 * Host half of dsh-mcp-admin.
 *
 * - Registers the `/mcp` command: queries ServerInventory to display
 *   the current profile's configured MCP servers with live tool counts.
 * - Exposes a `TypertRemoteService` (`ctx.remote.mcpAdmin.*`) backed by
 *   ServerInventory that the browser client self-mounts.
 */

import type { Context } from '@deepseek-ai/cordis'
import { basename } from 'node:path'
import type { CommandDefinition } from '@deepseek-ai/dsh-commands'
import type { ToolSchema } from '@deepseek-ai/dsh-llm'
import type { ServerDef } from './profile-store.ts'
import { McpAdminRemote } from './remote.ts'
import { ServerInventory } from './inventory.ts'

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

  if (currentProfile === undefined) {
    ctx.logger.warn('mcp-admin: current profile unknown (no ctx.baseUrl); admin disabled')
    return
  }

  const inventory = new ServerInventory({
    dshHome: home,
    profile: currentProfile,
    getTools: () => ctx.tools.schemas() as ToolSchema[],
    getActiveServerNames: () => getActiveServerNames(ctx),
  })

  const command: CommandDefinition = {
    name: 'mcp',
    description: 'Show MCP server status for current profile; /mcp <server> shows tools',
    handler: async (invocation) => {
      const arg = invocation.rawInput.trim()

      // `/mcp ls` — full server list as JSON with live tool counts (for UI).
      if (arg === 'ls') {
        const servers = inventory.list().map(s => ({
          ...s,
          tools: s.toolCount,
        }))
        return { kind: 'success', text: JSON.stringify(servers) }
      }

      // `/mcp set <json>` — reconcile the current profile to the given flat list.
      if (arg.startsWith('set ')) {
        const body = arg.slice(4).trim()
        try {
          const servers = JSON.parse(body) as ServerDef[]
          inventory.sync(servers)
          return { kind: 'success', text: 'ok' }
        } catch (err) {
          return { kind: 'error', text: `invalid JSON: ${err instanceof Error ? err.message : String(err)}` }
        }
      }

      // Drill into one server if an arg was given.
      if (arg) {
        const res = inventory.formatDetail(arg)
        return res.ok
          ? { kind: 'success', text: res.text }
          : { kind: 'error', text: res.text }
      }

      return { kind: 'success', text: inventory.formatSummary() }
    },
  }
  ctx.commands.register(command)

  // Structured remote: auto-discovered @Remote methods on McpAdminRemote.
  ctx.effect(() => {
    new McpAdminRemote(ctx, inventory)
  }, 'mcp-admin: structured remote')
}

/** Extract serverName from active mcp-client fibers in the Cordis registry. */
function getActiveServerNames(ctx: Context): Set<string> {
  const names = new Set<string>()
  for (const [, runtime] of ctx.registry.entries()) {
    if (runtime.name !== 'mcp-client' && runtime.name !== '@deepseek-ai/dsh-mcp-client' && !runtime.name.endsWith('mcp-client')) continue
    for (const fiber of runtime.fibers) {
      const serverName = (fiber.config as { serverName?: string } | undefined)?.serverName
      if (serverName) names.add(serverName)
    }
  }
  return names
}