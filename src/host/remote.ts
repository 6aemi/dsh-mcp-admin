/**
 * Structured Host→Client remote for MCP admin.
 *
 * A `TypertRemoteService` marks its `@Remote` methods as wire endpoints the
 * Host gateway auto-discovers (via src-claims) without a generated artifact.
 *
 * The client reaches these as `ctx.remote.mcpAdmin.*` after mounting
 * via `ctx.remote.$mount`.
 */

import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { ServerDef } from './profile-store.ts'
import type { ServerInventory } from './inventory.ts'

/** A server plus its live tool count and load state (from the app's loaded MCP clients). */
export interface ServerView extends ServerDef {
  tools: number
  /** True when the app has an mcp-client instance running for this serverName. */
  loaded: boolean
  /**
   * True when an mcp-client plugin instance exists for this serverName (even if
   * it has zero tools — connection failed).
   */
  active: boolean
}

/** Wire namespace served under `ctx.remote.mcpAdmin`. */
export class McpAdminRemote extends TypertRemoteService {
  private readonly inventory: ServerInventory

  constructor(ctx: Context, inventory: ServerInventory) {
    super(ctx, 'mcpAdmin')
    this.inventory = inventory
  }

  /** The current profile's MCP servers as structured defs, with live tool counts. */
  @Remote
  list(): ServerView[] {
    return this.inventory.list().map(s => ({
      ...s,
      tools: s.toolCount,
    }))
  }

  /** Reconcile the current profile's patch file to the given server list. */
  @Remote
  set(servers: ServerDef[]): { ok: boolean } {
    return this.inventory.sync(servers)
  }
}