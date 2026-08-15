# AGENTS.md — Agent & Contributor Guide for dsh-mcp-admin

`dsh-mcp-admin` is an official-standard plugin for **DeepSeek Harness (`dsh`)** that provides:
1. **Host-side MCP Management**: `/mcp` command and `@Remote` RPC backend managing MCP servers across profiles.
2. **Browser-side Settings Panel**: Full-featured GUI in the settings modal with live connection states, add/edit/delete/toggle controls, and bilingual (zh/en) i18n support.

---

## 📁 Repository Structure

```
.
├── src/
│   ├── host/                     # Node.js backend (Host half)
│   │   ├── index.ts              # Cordis apply entry point, commands & @Remote service
│   │   ├── profile-store.ts      # Profile discovery, YAML patch parser & atomic writer
│   │   ├── profile-store.test.ts # YAML reconciliation & comment preservation tests
│   │   ├── server-inventory.ts   # Live tool counts & connection state machine
│   │   └── server-inventory.test.ts
│   ├── client/                   # Browser frontend (Client half)
│   │   ├── index.ts              # Client entry point, remote mount & slot injection
│   │   ├── McpAdminSection.tsx   # React settings section component
│   │   ├── McpAdminSection.css   # Standalone component styling (Figma token-aligned)
│   │   ├── css.d.ts              # Text loader CSS ambient types
│   │   ├── locales.ts            # Bilingual dictionaries (zh & en)
│   │   ├── server-draft.ts       # Form validation, state derivations & draft modeling
│   │   └── server-draft.test.ts  # Client draft & i18n unit tests
│   └── types/
│       └── dsh.d.ts              # Portable ambient types for @deepseek-ai/* packages
├── scripts/
│   ├── build.mjs                 # esbuild atomic bundler (host ESM + client CJS closure)
│   └── release.mjs               # Automated SemVer bumper, doc syncer & git tagger
├── .github/
│   ├── workflows/ci.yml          # GitHub Actions CI (typecheck, test, build, pack)
│   ├── workflows/release.yml     # Automated GitHub Release publisher with notes
│   └── release.yml               # GitHub release notes categorization template
├── cordis.patch.yml              # Default plugin wiring patch
├── package.json
└── tsconfig.json
```

---

## 🛠️ Development & Build Commands

All standard development tasks should use `pnpm`:

```bash
# 1. Install dependencies
pnpm install

# 2. Run TypeScript typecheck (0 error tolerance)
pnpm run typecheck

# 3. Run unit tests (Node.js native test runner)
pnpm test

# 4. Build output artifacts into lib/
pnpm run build

# 5. Dry-run package archive creation
pnpm pack --dry-run

# 6. Automated version release (bumps package.json, syncs READMEs, runs tests, commits & tags)
pnpm release         # Bumps patch: 0.2.0 -> 0.2.1
pnpm release minor   # Bumps minor: 0.2.0 -> 0.3.0
pnpm release major   # Bumps major: 0.2.0 -> 1.0.0
```

---

## 🏗️ Architecture & Coding Standards

### 1. TC39 Stage 3 Standard Decorators
- **Strict Requirement**: `dsh-typert-protocol` uses standard TC39 Stage 3 decorators (`(method, context)` with `context.addInitializer`).
- **Do NOT enable `experimentalDecorators: true`** in `tsconfig.json`. Doing so causes esbuild to emit legacy TypeScript decorator helpers (`__decorateClass`), which crash the runtime.

### 2. Host & Client Separation
- **Host half** (`src/host/`): Built as pure Node.js ESM (`format: 'esm'`, `platform: 'node'`).
- **Client half** (`src/client/`): Built as browser CJS wrapped in `window.__ModuleLoader__.load({ id: "dsh-mcp-admin", factory: ... })`.
- Stylesheet (`McpAdminSection.css`) is imported as raw text at build time (`loader: { '.css': 'text' }`) and injected into `document.head` permanently upon plugin init.

### 3. Internationalization (i18n)
- All user-facing strings must be declared in [`src/client/locales.ts`](file:///home/kairo/dsh-plugin/src/client/locales.ts) with both `zh` and `en` translations.
- Register dictionaries via `ctx.locale.register(NS, { zh, en })` and bind translators with `ctx.locale.bind(NS)`.
- Never hardcode raw user-facing text in JSX.

### 4. Git & Release Workflow
- **Git Push Policy**: **NEVER run `git push` without explicit instruction from the user.**
- Commits should follow Conventional Commits format (`feat(...)`, `fix(...)`, `chore(...)`, `ci(...)`).
