// Transpile+bundle build, self-contained (no monorepo dependence).
// Host half: node backend (/mcp + settings bridge).
// Client half: dsh __ModuleLoader__ closure-factory bundle (settings panel).
//
// Note: no symlink / resolution hacks — a properly installed bundle (tarball /
// npm / git-with-prepare) lives inside the profile tree, so `@deepseek-ai/*`
// resolves via ordinary Node parent-walk to the healed profiles/node_modules.
import { build } from 'esbuild'
import { rmSync, writeFileSync, renameSync, mkdirSync } from 'node:fs'

rmSync('lib', { recursive: true, force: true })
mkdirSync('lib/host', { recursive: true })

// Host half (node). Atomic write so dsh never loads a partial file.
const host = await build({
  entryPoints: ['src/host/index.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  sourcemap: false,
  absWorkingDir: process.cwd(),
  external: ['@deepseek-ai/*', 'yaml'],
  write: false,
})
atomicWrite('lib/host/index.js', host.outputFiles[0].text)

// Client half (browser). Build as CJS so esbuild emits `module.exports`
// assignments; wrap in the loader's closure factory with module/exports locals
// and return module.exports (the contract real client bundles follow).
const client = await build({
  entryPoints: ['src/client/index.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  loader: { '.css': 'text' },
  sourcemap: false,
  absWorkingDir: process.cwd(),
  external: ['react', 'react/jsx-runtime', '@deepseek-ai/*'],
  write: false,
})
const body = client.outputFiles[0].text
const wrapped = `window.__ModuleLoader__.load({
\tid: "dsh-mcp-admin",
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
${body}
\t\treturn module.exports;
\t}
});\n`
atomicWrite('lib/client.js', wrapped)

function atomicWrite(file, text) {
  const tmp = file + '.tmp'
  try {
    writeFileSync(tmp, text)
    renameSync(tmp, file)
  } catch (err) {
    try { rmSync(tmp, { force: true }) } catch {}
    throw err
  }
}

console.log('built lib/ (host + client bundle, atomic)')