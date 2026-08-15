#!/usr/bin/env node

/**
 * Automated release & version bump script for dsh-mcp-admin.
 *
 * Usage:
 *   node scripts/release.mjs [patch | minor | major | <custom-version>]
 *
 * Examples:
 *   pnpm release         # bumps patch: 0.2.0 -> 0.2.1
 *   pnpm release minor   # bumps minor: 0.2.0 -> 0.3.0
 *   pnpm release major   # bumps major: 0.2.0 -> 1.0.0
 *   pnpm release 0.3.5   # sets explicit version: 0.3.5
 */

import fs from 'node:fs'
import { execSync } from 'node:child_process'

function run(cmd) {
  return execSync(cmd, { stdio: 'inherit', encoding: 'utf8' })
}

function getOutput(cmd) {
  return execSync(cmd, { encoding: 'utf8' }).trim()
}

// 1. Check git working tree
const status = getOutput('git status --porcelain')
if (status) {
  console.error('\x1b[31mError: Git working tree is not clean. Please commit or stash changes before releasing.\x1b[0m')
  process.exit(1)
}

// 2. Read package.json
const pkgRaw = fs.readFileSync('package.json', 'utf8')
const pkg = JSON.parse(pkgRaw)
const currentVersion = pkg.version

// 3. Determine next version
const arg = process.argv[2] || 'patch'
let nextVersion = ''

const match = currentVersion.match(/^(\d+)\.(\d+)\.(\d+)/)
if (!match) {
  console.error(`\x1b[31mError: Invalid current version in package.json: ${currentVersion}\x1b[0m`)
  process.exit(1)
}

const [, major, minor, patch] = match.map(Number)

if (arg === 'patch') {
  nextVersion = `${major}.${minor}.${patch + 1}`
} else if (arg === 'minor') {
  nextVersion = `${major}.${minor + 1}.0`
} else if (arg === 'major') {
  nextVersion = `${major + 1}.0.0`
} else if (/^\d+\.\d+\.\d+/.test(arg)) {
  nextVersion = arg.replace(/^v/, '')
} else {
  console.error(`\x1b[31mError: Unknown version bump argument: "${arg}". Use "patch", "minor", "major", or a specific version like "0.3.0".\x1b[0m`)
  process.exit(1)
}

console.log(`\x1b[36m🚀 Bumping version: ${currentVersion} -> ${nextVersion}\x1b[0m\n`)

// 4. Update package.json
pkg.version = nextVersion
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n')
console.log('✓ Updated package.json')

// 5. Update README.md and README.zh.md
const docFiles = ['README.md', 'README.zh.md']
for (const file of docFiles) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8')
    content = content.replace(/dsh-mcp-admin-\d+\.\d+\.\d+\.tgz/g, `dsh-mcp-admin-${nextVersion}.tgz`)
    content = content.replace(/dsh-mcp-admin#v\d+\.\d+\.\d+/g, `dsh-mcp-admin#v${nextVersion}`)
    fs.writeFileSync(file, content)
    console.log(`✓ Updated ${file}`)
  }
}

// 6. Run verification (typecheck, tests, build)
console.log('\n\x1b[36m🧪 Running typecheck and tests...\x1b[0m')
run('npm run typecheck')
run('npm test')
run('npm run build')

// 7. Git commit & tag
console.log('\n\x1b[36m📦 Creating release commit and git tag...\x1b[0m')
run(`git add package.json ${docFiles.join(' ')}`)
run(`git commit -m "chore(release): bump version to ${nextVersion}"`)
run(`git tag v${nextVersion}`)

console.log(`\n\x1b[32m✨ Successfully created release v${nextVersion}!\x1b[0m`)
console.log(`\x1b[33mTo publish, push to GitHub with:\x1b[0m`)
console.log(`  git push origin main && git push origin v${nextVersion}\n`)
