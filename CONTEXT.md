# CONTEXT — dsh MCP 管理插件

术语表。这是**词汇约定**，不含实现细节。

## 概念

- **MCP server**：一个外部 MCP 服务（stdio 或 streamable-http），通过 `@deepseek-ai/dsh-mcp-client` 插件实例接入 dsh。
- **MCP tool**：MCP server 暴露的工具，以 `mcp__<serverName>__<rawName>` 注册进 `ctx.tools`。
- **serverName**：MCP server 的本地命名空间，唯一，用于工具名前缀和显示标识。
- **启用 / 禁用**：一个 MCP server 是否被 dsh 加载。禁用保留配置但不加载（`disabled: true`）。
- **新增 / 编辑 / 删除**：对一个 MCP server 配置的增删改。删除是永久移除。
- **连接状态**：server 是否连上并同步了工具。无编程态健康 API,从两个信号间接推断:`ctx.tools` 里的 `mcp__` 工具(tool 数)与 Cordis registry 里的 mcp-client 实例(实例在但 0 工具 = 连接失败,无实例 = 未加载)。
- **cordis.patch.yml**：用户级配置 patch 文件，MCP server 实例以 `- insert` 条目存在其中。
- **HMR（热重载）**：patch 文件改动后，dsh 自动卸载旧插件实例、按新配置加载新实例。
- **settings.section**：Client 端设置页里的一个完整设置面板槽位。
- **ServerInventory**：当前 Profile 的 MCP server 配置清单、实时工具集合与连接状态的权威领域汇聚模块。
- **`/mcp` 命令**：Host 端文本命令，列出当前 profile 的 MCP server 状态与实时 tool 数；`/mcp <server>` drill 进单个 server 的工具列表。
- **状态轮询**：设置面板每秒轮询一次 `mcpAdmin.list()` 刷新状态点与 tool 数，离开页面停止。

## 关系

- 一个 MCP server = 一条 `insert` 条目
- 一个 MCP server 可注册多个 MCP tool
- 禁用 ≠ 删除（禁用保留配置）

## 边界

- **能看到**：配置了的所有 server（含从未连接的）——`/mcp` 和设置面板都从 `cordis.patch.yml` 读全量清单，实时 tool 状态只做标注。
- **不提供**：连接健康度、重连控制——dsh 无此编程态 API，只借 tool 注册与 registry 实例间接推断。
