/**
 * Pure domain value module for client-side MCP server drafts,
 * serialization, validation, and status classification.
 */

import type { StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ServerDef } from '../host/profile-store.ts'

/** Editable draft representation of an MCP server in the UI. */
export type ServerDraft = ServerDef & {
  argsText?: string
  headersText?: string
  tools?: number
  loaded?: boolean
  active?: boolean
}

export const TRANSPORT_LABELS: Record<'stdio' | 'streamable-http', string> = {
  stdio: 'stdio',
  'streamable-http': 'http',
}

/** Create a new blank draft for adding a server. */
export function createEmptyDraft(profile = ''): ServerDraft {
  return {
    id: '',
    profile,
    serverName: '',
    transport: 'stdio',
    command: '',
    url: '',
    disabled: false,
    argsText: '',
    headersText: '',
  }
}

/** Convert a persisted ServerDef to an editable ServerDraft. */
export function toDraft(s: ServerDef & { tools?: number; loaded?: boolean; active?: boolean }): ServerDraft {
  const withText = s as Partial<ServerDraft>
  return {
    ...s,
    argsText: withText.argsText ?? (s.args ?? []).join('\n'),
    headersText: withText.headersText ?? Object.entries(s.headers ?? {}).map(([k, v]) => `${k}=${v}`).join('\n'),
  }
}

/**
 * Parse multiline textarea inputs and clean up empty fields
 * for persisting back to the host.
 */
export function toCleanServer(draft: ServerDraft): ServerDef {
  const { argsText, headersText, args: _args, headers: _headers, tools: _t, loaded: _l, active: _a, ...rest } = draft

  const args = (argsText ?? '')
    .split('\n')
    .map(x => x.trim())
    .filter(Boolean)

  const headers = Object.fromEntries(
    (headersText ?? '')
      .split('\n')
      .map(x => x.trim())
      .filter(Boolean)
      .map(line => {
        const i = line.indexOf('=')
        return i >= 0 ? [line.slice(0, i).trim(), line.slice(i + 1).trim()] : [line, '']
      }),
  )

  return {
    ...rest,
    ...(args.length > 0 ? { args } : {}),
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
  }
}

/**
 * Validate draft fields before saving.
 * Checks id presence for new servers, serverName, and transport requirements.
 */
export function validateDraft(draft: ServerDraft, isNew = false): { valid: boolean; error?: string } {
  if (isNew && !draft.id.trim()) {
    return { valid: false, error: 'New server needs an id.' }
  }

  if (!draft.serverName.trim()) {
    return { valid: false, error: 'Server needs a serverName.' }
  }

  if (draft.transport === 'stdio') {
    if (!(draft.command ?? '').trim()) {
      return { valid: false, error: `"${draft.serverName || draft.id}" needs a command to save.` }
    }
  } else {
    if (!(draft.url ?? '').trim()) {
      return { valid: false, error: `"${draft.serverName || draft.id}" needs a url to save.` }
    }
  }

  return { valid: true }
}

/**
 * Per-server status dot state:
 * - warning: disabled
 * - ongoing: pending / reload in flight (no mcp-client instance active yet)
 * - done: instance active and has at least one live tool
 * - error: instance active in registry but zero tools (connection failed)
 */
export function serverState(d: { disabled?: boolean; active?: boolean; tools?: number }): StateDotState {
  if (d.disabled) return 'warning'
  if (d.active !== true) return 'ongoing'
  return (d.tools ?? 0) > 0 ? 'done' : 'error'
}

/**
 * Human-readable status label (used by /mcp popup select and status pills).
 */
export function serverStatusLabel(d: { disabled?: boolean; active?: boolean; tools?: number }): string {
  if (d.disabled) return 'disabled'
  if ((d.tools ?? 0) > 0) return 'connected'
  if (d.active === true) return 'connection failed'
  return 'disconnected'
}

/** Count of enabled servers with at least one live tool. */
export function connectedCount(drafts: readonly { disabled?: boolean; tools?: number }[]): number {
  return drafts.filter(d => !d.disabled && (d.tools ?? 0) > 0).length
}
