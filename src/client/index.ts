/**
 * Client half of dsh-mcp-admin: a settings section that manages MCP servers.
 *
 * Reads and writes MCP servers through the `mcpAdmin` typert remote, which
 * this half mounts itself via `ctx.remote.$mount` (no framework change). A
 * remote invocation does NOT create a /command conversation node (unlike
 * `remote.commands.execute`), so the popup and settings panel get structured
 * data without dumping text into the chat — and without needing a session.
 */

import type { Context } from '@deepseek-ai/cordis'
import { McpAdminSection, type McpAdminSectionInjected, type McpAdminSectionProps } from './McpAdminSection.tsx'
import type { ServerDef } from '../host/profile-store.ts'

export const name = 'mcp-admin-client'
export const inject = ['slots', 'commandUi', 'remote', 'remote.commands', 'locale']

export type { McpAdminSectionProps, McpAdminSectionInjected } from './McpAdminSection.tsx'

import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'

/** Remote namespace accessor (typed by hand; the generated stamp is absent). */
interface McpAdminRemoteApi {
  list(): Promise<{ ok: boolean; value?: ServerView[]; error?: { code: string; message: string } }>
  set(servers: ServerDef[]): Promise<{ ok: boolean; value?: { ok: boolean }; error?: { code: string; message: string } }>
}

/** A server plus its live tool count and load state, as the host serves it. */
interface ServerView extends ServerDef {
  tools: number
  loaded: boolean
  /** True when an mcp-client instance exists even with zero tools (dead connection). */
  active: boolean
}

interface SessionCtx {
  sessionId: string
}

interface CommandUiLike {
  decorate(d: {
    name: string
    available?(session: unknown): boolean
    ui: {
      kind: 'popupSelect'
      options(session: unknown, signal: AbortSignal): Promise<readonly { id: string; label: string; detail?: string; active?: boolean }[]>
      onSelect(option: { id: string; label: string }, session: SessionCtx): void | Promise<void>
    }
  }): () => void
}

// ---- Strict wire codecs for the self-mounted remote ----
// The host dispatches via src-claims (no schema validation) and the client
// only needs `schema` to satisfy the strict-codec shape check (`_zod` present,
// `parse` callable). A pass-through suffices — no need to bundle zod.
import type { TypertCodec } from '@deepseek-ai/dsh-typert-protocol'
const passthrough = (typeSymbol: string): TypertCodec => ({
  mode: 'strict',
  typeSymbol,
  schema: { _zod: true as const, parse: (v: unknown) => v },
})

/** Hand-written `./remote` contribution for the mcpAdmin namespace. */
const contribution: TypertRemoteContribution = {
  package: 'dsh-mcp-admin',
  descriptors: [
    {
      id: 'dsh-mcp-admin#mcpAdmin#list',
      service: 'mcpAdmin',
      namespace: 'mcpAdmin',
      method: 'list',
      invocation: { kind: 'direct' },
      parameters: [],
      result: passthrough('ServerView[]'),
    },
    {
      id: 'dsh-mcp-admin#mcpAdmin#set',
      service: 'mcpAdmin',
      namespace: 'mcpAdmin',
      method: 'set',
      invocation: { kind: 'direct' },
      parameters: [
        { name: 'servers', wire: 'servers', source: 'json', codec: passthrough('ServerDef[]') },
      ],
      result: passthrough('{ok:boolean}'),
    },
  ],
}

export function apply(ctx: Context): void {
  const commandUi = ctx.get('commandUi') as CommandUiLike
  const remote = ctx.get('remote') as unknown as {
    $mount(c: TypertRemoteContribution): Promise<unknown>
  }
  const mounted = remote.$mount(contribution).then(
    () => undefined,
    (err: unknown) => { ctx.logger.warn('mcp-admin: remote mount failed', err) },
  )

  // The namespace is created by $mount; reach it via ctx.get (property access
  // would demand an inject declaration for a service we create ourselves).
  const mcpAdmin = async (): Promise<McpAdminRemoteApi> => {
    await mounted
    return ctx.get('remote.mcpAdmin') as unknown as McpAdminRemoteApi
  }

  // /mcp opens a popupSelect of the configured servers above the input (like
  // /model). Data comes from ctx.remote.mcpAdmin.list() — no command, no chat.
  // Selecting a server executes `/mcp <server>` so its full tool list lands as
  // a durable command node in the conversation.
  ctx.effect(() => commandUi.decorate({
    name: 'mcp',
    available: () => true,
    ui: {
      kind: 'popupSelect',
      options: async () => {
        const servers = await listServers(mcpAdmin())
        return servers.map(s => ({
          id: s.serverName,
          label: `${s.serverName} · ${s.tools} tools`,
          detail: s.disabled ? 'disabled' : (s.tools > 0 ? 'connected' : 'disconnected'),
        }))
      },
      onSelect: async (option, session) => {
        const commands = ctx.get('remote.commands') as unknown as {
          execute(sessionId: string, line: string): Promise<{ ok: boolean; value?: unknown; error?: { code: string; message: string } }>
        }
        const res = await commands.execute(session.sessionId, `/mcp ${option.id}`)
        if (!res?.ok) throw new Error(`command execute failed: ${res?.error?.code}: ${res?.error?.message}`)
        // ok:true + value:undefined = command name didn't resolve → no node was
        // created, so surface it instead of silently doing nothing.
        if (res.value === undefined) throw new Error(`command not found: /mcp ${option.id}`)
      },
    },
  }), 'mcp-admin: /mcp decoration')

  const injected = (): McpAdminSectionInjected => ({
    loadServers: async () => listServers(mcpAdmin()),
    saveServers: async (servers) => {
      const res = await (await mcpAdmin()).set(servers as ServerDef[])
      if (!res?.ok) throw new Error(`mcp save failed: ${res?.error?.code}: ${res?.error?.message}`)
    },
  })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'mcp-admin',
    order: 20,
    label: () => 'MCP',
    inject: injected,
  }, McpAdminSection))
}

/** Fetch the full server list (with tool counts) from the host. */
async function listServers(api: Promise<McpAdminRemoteApi>): Promise<ServerView[]> {
  const res = await (await api).list()
  if (!res?.ok) return []
  return res.value ?? []
}