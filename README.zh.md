# dsh-mcp-admin

<p align="center">
  <a href="README.md">English</a> | 简体中文
</p>

一个 dsh (DeepSeek Harness) 插件：**查看 MCP 状态**（`/mcp` 命令）+ **在设置页管理 MCP 服务**（增删改启停，写回 `cordis.patch.yml`）。[MIT](LICENSE) 许可。

`/mcp` 命令输出:

![`/mcp` 命令](command.png)

设置页「MCP」面板:

![设置页 MCP 面板](setting.png)

## 安装

**Release tarball**(推荐,无需构建):到 [Releases](https://github.com/kairoz9/dsh-mcp-admin/releases) 下载 `dsh-mcp-admin-<version>.tgz`,然后:

```sh
dsh plugin --profile web add ./dsh-mcp-admin-0.2.0.tgz
```

**本地构建 tarball**(想自己打):

```sh
pnpm run build        # 产出 lib/
pnpm pack             # 打成 tarball
dsh plugin --profile web add ./dsh-mcp-admin-0.2.0.tgz
```

**Git 源码**(拉源码,靠 `prepare` 构建):

```sh
dsh plugin --profile web add github:kairoz9/dsh-mcp-admin
```

> pnpm ≥10 默认拒绝运行 git 依赖的 `prepare` 脚本,第一次 Git 安装会失败。dsh 会在报错里打印修法:把包键加进该 profile 的 `pnpm-workspace.yaml`,再重新 add:
> ```yaml
> allowBuilds:
>   dsh-mcp-admin: true
> ```
> 建议锁 commit 或 tag:`github:kairoz9/dsh-mcp-admin#v0.2.0`。

## 使用

- `/mcp` —— 列出所有 profile 的 MCP server + 实时 tool 数(含从未连接成功的,从配置读全量清单)。
- 设置页「MCP」面板 —— 按 profile 管理 MCP server:新增 / 编辑 / 禁用 / 启用 / 删除,状态点每秒轮询自动刷新。保存后回写该 profile 的 `cordis.patch.yml`,dsh 自动 HMR 加载。

## 如何工作

Host 端 `McpAdminRemote`(`TypertRemoteService`,`@Remote` 方法)被宿主网关自动发现,浏览器客户端用 `ctx.remote.$mount` 自挂这个命名空间,面板和 `/mcp` 弹窗读同一份结构化数据:

- `list()` —— 从该 profile 的 `cordis.patch.yml` 读全量 server 清单,再用 `ctx.tools.schemas()` 筛 `mcp__` 前缀实时标注 tool 数;从 Cordis registry 枚举活跃的 mcp-client 实例区分「连接成功 / 实例在但 0 工具(连接失败) / 未加载」。
- `set()` —— 对账写回 `cordis.patch.yml`(单次原子写,注释保留),dsh 的 `watchUserPatches` HMR 自动重载 mcp-client。
- `/mcp` 命令读所有 profile,输出每个 server 的工具列表。
