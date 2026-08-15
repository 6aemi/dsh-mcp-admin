# dsh-mcp-admin

<p align="center">
  <a href="README_en.md">English</a> | <a href="README.md">简体中文</a>
</p>

A dsh (DeepSeek Harness) plugin: **Inspect MCP status** (`/mcp` command) + **Manage MCP servers in Settings** (add / edit / delete / enable / disable, written back to `cordis.patch.yml`). [MIT](LICENSE) licensed.

`/mcp` command output:

![`/mcp` command](command.png)

Settings page "MCP" panel:

![Settings MCP Panel](setting.png)

## Installation

**Release tarball** (Recommended, no build required): Download `dsh-mcp-admin-<version>.tgz` from [Releases](https://github.com/kairoz9/dsh-mcp-admin/releases), then run:

```sh
dsh plugin --profile web add ./dsh-mcp-admin-0.1.0.tgz
```

**Build tarball locally** (if building yourself):

```sh
node build.mjs        # Builds to lib/
pnpm pack             # Packages into tarball
dsh plugin --profile web add ./dsh-mcp-admin-0.1.0.tgz
```

**Git repository** (installs from source via `prepare` build):

```sh
dsh plugin --profile web add github:kairoz9/dsh-mcp-admin
```

> pnpm ≥10 refuses to run the `prepare` script of git dependencies by default, which causes the initial Git installation to fail. dsh will print the fix in the error message: add the package key to that profile's `pnpm-workspace.yaml` and re-run `add`:
> ```yaml
> allowBuilds:
>   dsh-mcp-admin: true
> ```
> It is recommended to pin a commit or tag: `github:kairoz9/dsh-mcp-admin#v0.1.0`.

## Usage

- `/mcp` — Lists MCP servers across all profiles + live tool count (including never-connected servers, read from full config inventory).
- Settings page "MCP" panel — Manage MCP servers per profile: add / edit / disable / enable / delete, with status dots auto-refreshing every second. Saving writes back to that profile's `cordis.patch.yml`, and dsh automatically hot-reloads (HMR).

## How It Works

Host-side `McpAdminRemote` (`TypertRemoteService`, `@Remote` methods) is auto-discovered by the host gateway. The browser client self-mounts this namespace via `ctx.remote.$mount`, and both the panel and `/mcp` popup read the same structured data:

- `list()` — Reads the full server inventory from the profile's `cordis.patch.yml`, then filters `mcp__` prefix with `ctx.tools.schemas()` to annotate real-time tool counts; enumerates active `mcp-client` instances from Cordis registry to distinguish "connected / instance present with 0 tools (connection failed) / not loaded".
- `set()` — Reconciles and writes back to `cordis.patch.yml` (single atomic write, comments preserved), and dsh's `watchUserPatches` HMR automatically reloads `mcp-client`.
- `/mcp` command reads all profiles and outputs the tool list for each server.
