/**
 * MCP settings section: lists the current profile's MCP servers with
 * live-ish state and offers add / edit / disable / remove. Loads from the host
 * on mount (`ctx.remote.mcpAdmin.list()`) and auto-saves every change to the
 * host (`ctx.remote.mcpAdmin.set()`) — no footer Save button.
 *
 * Each server card is collapsed by default: a status row (name + transport tag
 * + enabled switch + edit/delete). Clicking Edit expands the field editor;
 * Delete asks for confirmation through the shared Modal.
 */

import { useEffect, useMemo, useState } from 'react'
import { Button, Input, Modal, Pill, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ServerDef } from '../host/profile-store.ts'
import {
  type ServerDraft,
  toDraft,
  createEmptyDraft,
  toCleanServer,
  validateDraft,
  serverState,
  connectedCount,
  TRANSPORT_LABELS,
} from './server-draft.ts'
import CSS from './McpAdminSection.css'

/** Registration-side business face for the section. */
export interface McpAdminSectionInjected {
  /** Fetch the current profile's MCP servers from the host (as ServerDef[]). */
  loadServers: () => Promise<ServerDef[]>
  /** Persist the full server list (Host reconciles patch files). */
  saveServers: (servers: readonly ServerDef[]) => Promise<void>
}

/** Props the renderer binds for the section. */
export type McpAdminSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'mcp-admin'>
  & InjectFace<McpAdminSectionInjected>

export function McpAdminSection({ loadServers, saveServers }: McpAdminSectionProps) {
  const [drafts, setDrafts] = useState<ServerDraft[]>([])
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [deleteId, setDeleteId] = useState<string>()
  const [adding, setAdding] = useState(false)
  const [newServer, setNewServer] = useState<ServerDraft>()
  const [editingId, setEditingId] = useState<string>()
  const [editDraft, setEditDraft] = useState<ServerDraft>()

  useEffect(() => {
    let alive = true
    loadServers()
      .then(servers => { if (alive) setDrafts(servers.map(toDraft)) })
      .catch(err => { if (alive) setError(err instanceof Error ? err.message : String(err)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [loadServers])

  // Poll host per second for live state updates without clobbering in-progress text edits.
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const servers = await loadServers()
        setDrafts(prev => prev.map(d => {
          const fresh = servers.find(s => s.id === d.id)
          if (!fresh) return d
          const st = fresh as { tools?: number; loaded?: boolean; active?: boolean }
          return { ...d, tools: st.tools, loaded: st.loaded, active: st.active }
        }))
      } catch {
        // Silently retry next cycle.
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [loadServers])

  const persist = useMemo(() => {
    const run = async (list: readonly ServerDraft[]): Promise<void> => {
      for (const item of list) {
        const validation = validateDraft(item)
        if (!validation.valid) {
          setError(validation.error)
          return
        }
      }

      const clean = list.map(toCleanServer)
      try {
        await saveServers(clean)
        setError(undefined)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    }
    return { immediate: (list: readonly ServerDraft[]): void => { void run(list) } }
  }, [saveServers])

  const setAndSave = (next: ServerDraft[]): void => {
    setDrafts(next)
    persist.immediate(next)
  }

  const update = (id: string, patch: Partial<ServerDraft>): void => {
    setAndSave(drafts.map(d => (d.id === id ? { ...d, ...patch } : d)))
  }

  const openEdit = (d: ServerDraft): void => {
    setEditDraft(toDraft(d))
    setEditingId(d.id)
  }

  const closeEdit = (): void => {
    setEditingId(undefined)
    setEditDraft(undefined)
  }

  const saveEdit = (): void => {
    if (editingId === undefined || editDraft === undefined) return
    const validation = validateDraft(editDraft)
    if (!validation.valid) {
      setError(validation.error)
      return
    }
    setAndSave(drafts.map(d => (d.id === editingId ? editDraft : d)))
    closeEdit()
  }

  const updateEdit = (patch: Partial<ServerDraft>): void => {
    setEditDraft(d => (d === undefined ? d : { ...d, ...patch }))
  }

  const openAdd = (): void => {
    setNewServer(createEmptyDraft())
    setAdding(true)
  }

  const cancelAdd = (): void => {
    setAdding(false)
    setNewServer(undefined)
  }

  const saveAdd = (): void => {
    if (newServer === undefined) return
    const validation = validateDraft(newServer, true)
    if (!validation.valid) {
      setError(validation.error)
      return
    }
    setAndSave([...drafts, newServer])
    setAdding(false)
    setNewServer(undefined)
  }

  const updateNew = (patch: Partial<ServerDraft>): void => {
    setNewServer(d => (d === undefined ? d : { ...d, ...patch }))
  }

  const confirmDelete = (): void => {
    if (deleteId === undefined) return
    setAndSave(drafts.filter(d => d.id !== deleteId))
    setDeleteId(undefined)
  }

  return (
    <div className="mcpAs-section">
      <style>{CSS}</style>
      <div className="mcpAs-titleRow">
        <h2 className="mcpAs-title">MCP Servers</h2>
        <Pill className="mcpAs-pill">{connectedCount(drafts)}/{drafts.length} connected</Pill>
      </div>
      <p className="mcpAs-intro">
        Stored in this profile&apos;s cordis.patch.yml — changes hot-reload automatically.
      </p>
      {error && <p className="mcpAs-error">{error}</p>}

      {loading
        ? <p className="mcpAs-intro">Loading…</p>
        : drafts.length === 0
          ? <div className="mcpAs-emptySlot">No MCP servers configured.</div>
          : null}

      <ul className="mcpAs-rows">
        {drafts.map(d => (
          <li key={d.id} className="mcpAs-rowCard">
            <div className="mcpAs-rowHead">
              <span className="mcpAs-rowIdentity">
                <StateDot state={serverState(d)} />
                <span className="mcpAs-rowName">{d.serverName || 'unnamed'}</span>
                <Pill className="mcpAs-pill">{TRANSPORT_LABELS[d.transport]}</Pill>
                {d.disabled && <Pill className="mcpAs-pill">disabled</Pill>}
              </span>
              <div className="mcpAs-rowActions">
                <label className="mcpAs-switch" aria-label={d.disabled ? 'enabled' : 'disabled'}>
                  <input type="checkbox" checked={!d.disabled}
                    onChange={e => {
                      update(d.id, { disabled: !e.target.checked })
                      if (editingId === d.id) updateEdit({ disabled: !e.target.checked })
                    }} />
                  <span className="mcpAs-switchTrack" />
                  <span className="mcpAs-switchKnob" />
                </label>
                <Button variant="outline" size="sm" onClick={() => (editingId === d.id ? closeEdit() : openEdit(d))}>
                  {editingId === d.id ? 'Cancel' : 'Edit'}
                </Button>
                <Button variant="outline" size="sm" className="mcpAs-deleteConfirm" onClick={() => setDeleteId(d.id)}>
                  Delete
                </Button>
              </div>
            </div>

            {editingId === d.id && editDraft !== undefined && (
              <div className="mcpAs-editor">
                <div className="mcpAs-grid">
                  <div className="mcpAs-field">
                    <label className="mcpAs-fieldLabel">id</label>
                    <Input className="mcpAs-inputWrap" value={editDraft.id} disabled
                      onChange={e => updateEdit({ id: e.target.value })} />
                  </div>
                  <div className="mcpAs-field">
                    <label className="mcpAs-fieldLabel">serverName</label>
                    <Input className="mcpAs-inputWrap" placeholder="my-server" value={editDraft.serverName}
                      onChange={e => updateEdit({ serverName: e.target.value })} />
                  </div>
                  <div className="mcpAs-field">
                    <label className="mcpAs-fieldLabel">transport</label>
                    <select className="mcpAs-input mcpAs-selectInput" value={editDraft.transport}
                      onChange={e => updateEdit({ transport: e.target.value as 'stdio' | 'streamable-http' })}>
                      <option value="stdio">stdio</option>
                      <option value="streamable-http">http</option>
                    </select>
                  </div>
                  {editDraft.transport === 'stdio' ? (
                    <div className="mcpAs-field">
                      <label className="mcpAs-fieldLabel">command</label>
                      <Input className="mcpAs-inputWrap" placeholder="npx ..." value={editDraft.command ?? ''}
                        onChange={e => updateEdit({ command: e.target.value })} />
                    </div>
                  ) : (
                    <div className="mcpAs-field">
                      <label className="mcpAs-fieldLabel">url</label>
                      <Input className="mcpAs-inputWrap" placeholder="https://..." value={editDraft.url ?? ''}
                        onChange={e => updateEdit({ url: e.target.value })} />
                    </div>
                  )}
                  {editDraft.transport === 'stdio' ? (
                    <div className="mcpAs-field mcpAs-span2">
                      <label className="mcpAs-fieldLabel">args (one per line)</label>
                      <textarea className="mcpAs-textarea" rows={2} value={editDraft.argsText ?? ''}
                        onChange={e => updateEdit({ argsText: e.target.value })} />
                    </div>
                  ) : (
                    <div className="mcpAs-field mcpAs-span2">
                      <label className="mcpAs-fieldLabel">headers (key=value per line)</label>
                      <textarea className="mcpAs-textarea" rows={2} value={editDraft.headersText ?? ''}
                        onChange={e => updateEdit({ headersText: e.target.value })} />
                    </div>
                  )}
                </div>
                <div className="mcpAs-editorActions">
                  <Button variant="outline" onClick={closeEdit}>Cancel</Button>
                  <Button variant="primary" onClick={saveEdit}>Save</Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      {adding && newServer !== undefined && (
        <div className="mcpAs-addCard">
          <div className="mcpAs-addHead">
            <span className="mcpAs-rowName">New server</span>
          </div>
          <div className="mcpAs-grid">
            <div className="mcpAs-field">
              <label className="mcpAs-fieldLabel">id</label>
              <Input className="mcpAs-inputWrap" value={newServer.id}
                onChange={e => updateNew({ id: e.target.value })} />
            </div>
            <div className="mcpAs-field">
              <label className="mcpAs-fieldLabel">serverName</label>
              <Input className="mcpAs-inputWrap" placeholder="my-server" value={newServer.serverName}
                onChange={e => updateNew({ serverName: e.target.value })} />
            </div>
            <div className="mcpAs-field">
              <label className="mcpAs-fieldLabel">transport</label>
              <select className="mcpAs-input mcpAs-selectInput" value={newServer.transport}
                onChange={e => updateNew({ transport: e.target.value as 'stdio' | 'streamable-http' })}>
                <option value="stdio">stdio</option>
                <option value="streamable-http">http</option>
              </select>
            </div>
            {newServer.transport === 'stdio' ? (
              <div className="mcpAs-field">
                <label className="mcpAs-fieldLabel">command</label>
                <Input className="mcpAs-inputWrap" placeholder="npx ..." value={newServer.command ?? ''}
                  onChange={e => updateNew({ command: e.target.value })} />
              </div>
            ) : (
              <div className="mcpAs-field">
                <label className="mcpAs-fieldLabel">url</label>
                <Input className="mcpAs-inputWrap" placeholder="https://..." value={newServer.url ?? ''}
                  onChange={e => updateNew({ url: e.target.value })} />
              </div>
            )}
            {newServer.transport === 'stdio' ? (
              <div className="mcpAs-field mcpAs-span2">
                <label className="mcpAs-fieldLabel">args (one per line)</label>
                <textarea className="mcpAs-textarea" rows={2} value={newServer.argsText ?? ''}
                  onChange={e => updateNew({ argsText: e.target.value })} />
              </div>
            ) : (
              <div className="mcpAs-field mcpAs-span2">
                <label className="mcpAs-fieldLabel">headers (key=value per line)</label>
                <textarea className="mcpAs-textarea" rows={2} value={newServer.headersText ?? ''}
                  onChange={e => updateNew({ headersText: e.target.value })} />
              </div>
            )}
          </div>
          <div className="mcpAs-editorActions">
            <Button variant="outline" onClick={cancelAdd}>Cancel</Button>
            <Button variant="primary" onClick={saveAdd}>Save</Button>
          </div>
        </div>
      )}

      {!adding && (
        <Button variant="outline" className="mcpAs-addButton" onClick={openAdd}>+ Add server</Button>
      )}

      <Modal
        open={deleteId !== undefined}
        onClose={() => setDeleteId(undefined)}
        title="Remove MCP server?"
        description="This removes the server from this profile and disconnects it."
        footer={(
          <>
            <Button variant="outline" autoFocus onClick={() => setDeleteId(undefined)}>Cancel</Button>
            <Button variant="outline" className="mcpAs-deleteConfirm" onClick={confirmDelete}>Remove</Button>
          </>
        )}
      />
    </div>
  )
}