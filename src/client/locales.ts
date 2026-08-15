/**
 * i18n dictionaries for dsh-mcp-admin settings panel.
 * Supported locales: zh (Chinese) and en (English).
 */

export const NS = 'dsh-mcp-admin'

export const zh = {
  nav: 'MCP',
  title: 'MCP 服务',
  connected: '{connected}/{total} 已连接',
  intro: '保存在当前 Profile 的 cordis.patch.yml 中，配置修改将自动热重载。',
  loading: '加载中…',
  empty: '未配置任何 MCP 服务。',
  addServer: '添加服务',
  newServer: '新建服务',
  unnamed: '未命名',
  disabled: '已禁用',
  statusConnected: '已连接',
  statusFailed: '连接失败',
  statusDisconnected: '未连接',
  edit: '编辑',
  cancel: '取消',
  delete: '删除',
  save: '保存',
  id: 'id',
  serverName: 'serverName',
  transport: 'transport',
  command: 'command',
  url: 'url',
  args: 'args（每行一个）',
  headers: 'headers（每行 key=value）',
  placeholderServerName: 'my-server',
  placeholderCommand: 'npx ...',
  placeholderUrl: 'https://...',
  deleteModalTitle: '删除 MCP 服务？',
  deleteModalDesc: '将从当前 Profile 中移除该服务并断开连接。',
  deleteModalCancel: '取消',
  deleteModalConfirm: '删除',
}

export type LocaleKey = keyof typeof zh

export const en: Record<LocaleKey, string> = {
  nav: 'MCP',
  title: 'MCP Servers',
  connected: '{connected}/{total} connected',
  intro: "Stored in this profile's cordis.patch.yml — changes hot-reload automatically.",
  loading: 'Loading…',
  empty: 'No MCP servers configured.',
  addServer: 'Add server',
  newServer: 'New server',
  unnamed: 'unnamed',
  disabled: 'disabled',
  statusConnected: 'connected',
  statusFailed: 'connection failed',
  statusDisconnected: 'disconnected',
  edit: 'Edit',
  cancel: 'Cancel',
  delete: 'Delete',
  save: 'Save',
  id: 'id',
  serverName: 'serverName',
  transport: 'transport',
  command: 'command',
  url: 'url',
  args: 'args (one per line)',
  headers: 'headers (key=value per line)',
  placeholderServerName: 'my-server',
  placeholderCommand: 'npx ...',
  placeholderUrl: 'https://...',
  deleteModalTitle: 'Remove MCP server?',
  deleteModalDesc: 'This removes the server from this profile and disconnects it.',
  deleteModalCancel: 'Cancel',
  deleteModalConfirm: 'Delete',
}

export function defaultTranslate(key: string, params?: Record<string, unknown>): string {
  const dict = en as Record<string, string>
  const tmpl = dict[key] ?? key
  if (!params) return tmpl
  return Object.entries(params).reduce(
    (acc, [k, v]) => acc.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)),
    tmpl,
  )
}
