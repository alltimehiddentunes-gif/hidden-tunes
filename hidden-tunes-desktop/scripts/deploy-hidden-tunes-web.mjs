import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'

const CONFIG = Object.freeze({
  domain: 'hiddentunes.com',
  sshHost: '72.61.152.132',
  sshPort: '65002',
  sshUser: 'u489896272',
  remoteDomainRoot: '/home/u489896272/domains/hiddentunes.com',
  remoteDocumentRoot: '/home/u489896272/domains/hiddentunes.com/public_html',
  liveDirectoryName: 'staging',
  protectedRemotePaths: ['catalog-api', 'proxy-preview', '.htaccess', '.well-known', 'wp-admin', 'wp-content', 'wp-includes', 'wp-config.php'],
})

const desktopRoot = resolve(import.meta.dirname, '..')
const repositoryRoot = resolve(desktopRoot, '..')
const websiteRoot = resolve(desktopRoot, '..', '..', 'HiddenTunes-Web')
const websiteDist = join(websiteRoot, 'dist')
const committedDesktopDist = process.env.HT_COMMITTED_DESKTOP_DIST?.trim()
  ? resolve(process.env.HT_COMMITTED_DESKTOP_DIST.trim())
  : null
const evidenceRoot = 'D:\\HiddenTunes\\Release\\website-deployments'
const sshTarget = `${CONFIG.sshUser}@${CONFIG.sshHost}`
const args = process.argv.slice(2)
const mode = args[0]

if (!['--dry-run', '--production', '--rollback'].includes(mode)) {
  throw new Error('Usage: npm run deploy -- --dry-run | --production | --rollback <release-id>')
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd ?? desktopRoot,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    shell: process.platform === 'win32' && command.endsWith('.cmd'),
  })
  if (result.error || result.status !== 0) {
    const detail = options.capture ? `${result.stdout || ''}${result.stderr || ''}`.trim() : ''
    throw new Error(`${command} failed${detail ? `: ${detail}` : ''}`)
  }
  return options.capture ? result.stdout.trim() : ''
}

function ssh(remoteCommand, capture = true) {
  return run('ssh', ['-p', CONFIG.sshPort, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', sshTarget, remoteCommand], { capture })
}

function assertConfiguration() {
  if (CONFIG.domain !== 'hiddentunes.com' || CONFIG.sshHost !== '72.61.152.132' || CONFIG.remoteDocumentRoot !== '/home/u489896272/domains/hiddentunes.com/public_html') {
    throw new Error('Deployment target is outside the explicit Hidden Tunes allowlist')
  }
  if (!CONFIG.remoteDocumentRoot || ['/', `/home/${CONFIG.sshUser}`].includes(CONFIG.remoteDocumentRoot)) throw new Error('Unsafe remote document root')
}

function assertCommittedDesktopSource() {
  const dirty = run('git', ['status', '--porcelain', '--',
    'hidden-tunes-desktop/src', 'hidden-tunes-desktop/public', 'hidden-tunes-desktop/index.html',
    'hidden-tunes-desktop/vite.config.ts', 'hidden-tunes-desktop/package-lock.json'], { cwd: repositoryRoot, capture: true })
  if (dirty) throw new Error(`Desktop Website source has unrelated working-tree changes; commit or isolate them before deploy:\n${dirty}`)
}

function assertCommittedDesktopDist() {
  if (!committedDesktopDist) return false
  const tempRoot = `${resolve(tmpdir())}${sep}`
  if (!committedDesktopDist.startsWith(tempRoot) || !existsSync(join(committedDesktopDist, 'index.html'))) {
    throw new Error('HT_COMMITTED_DESKTOP_DIST must be a built exact-commit artifact under the operating-system temp directory')
  }
  return true
}

async function walk(root, directory = root) {
  const output = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) output.push(...await walk(root, path))
    else output.push({ path, relative: relative(root, path).split(sep).join('/') })
  }
  return output
}

async function buildManifest() {
  if (!existsSync(join(websiteDist, 'index.html'))) throw new Error('Website dist/index.html is missing')
  const files = await walk(websiteDist)
  const forbidden = files.filter(({ relative: name }) => /(^|\/)(\.env(?:\.|$)|private|reports?\/)|\.map$/i.test(name))
  if (forbidden.length) throw new Error(`Forbidden Website output: ${forbidden.map(x => x.relative).join(', ')}`)
  const index = await readFile(join(websiteDist, 'index.html'), 'utf8')
  for (const match of index.matchAll(/(?:src|href)=["']([^"'#?]+)["']/g)) {
    const value = match[1]
    if (/^(?:https?:|data:|\/\/)/i.test(value)) continue
    const asset = resolve(websiteDist, value.replace(/^\.\//, '').replace(/^\//, ''))
    if (!asset.startsWith(`${websiteDist}${sep}`) || !existsSync(asset)) throw new Error(`index.html references missing or unsafe asset: ${value}`)
  }
  const manifest = []
  let bytes = 0
  for (const file of files) {
    const content = await readFile(file.path)
    bytes += content.length
    manifest.push({ path: file.relative, bytes: content.length, sha256: createHash('sha256').update(content).digest('hex') })
  }
  return { files: manifest, bytes }
}

function remotePreflight() {
  const root = CONFIG.remoteDocumentRoot
  return ssh(`set -eu; test "$(pwd)" = "/home/${CONFIG.sshUser}"; test -d "${root}"; test -f "${root}/.htaccess"; test -d "${root}/${CONFIG.liveDirectoryName}"; test -f "${root}/${CONFIG.liveDirectoryName}/index.html"; test -f "${root}/${CONFIG.liveDirectoryName}/.htaccess"; test -d "${root}/${CONFIG.liveDirectoryName}/catalog-api"; grep -q "^RewriteRule \\^catalog-api" "${root}/.htaccess"; grep -q "${CONFIG.liveDirectoryName}/\\$1" "${root}/.htaccess"; printf 'live_index_sha256='; sha256sum "${root}/${CONFIG.liveDirectoryName}/index.html" | cut -d' ' -f1; df -Pk "${root}" | tail -1`)
}

async function prepare() {
  assertConfiguration()
  if (assertCommittedDesktopDist()) {
    await rm(join(desktopRoot, 'dist'), { recursive: true, force: true })
    await cp(committedDesktopDist, join(desktopRoot, 'dist'), { recursive: true, force: true })
  } else {
    assertCommittedDesktopSource()
    run('npm.cmd', ['run', 'build'], { cwd: desktopRoot })
  }
  run('npm.cmd', ['run', 'build'], { cwd: websiteRoot })
  run('node', ['scripts/verify-desktop-parity.mjs'], { cwd: websiteRoot })
  run('node', ['scripts/verify-phase4.mjs'], { cwd: websiteRoot })
  run('node', ['scripts/verify-universal-mobile-fit.mjs'], { cwd: websiteRoot })
  const manifest = await buildManifest()
  const remote = remotePreflight()
  return { manifest, remote }
}

async function dryRun() {
  const { manifest, remote } = await prepare()
  const remoteFiles = ssh(`find "${CONFIG.remoteDocumentRoot}/${CONFIG.liveDirectoryName}" -type f -printf '%P\\n' | sort`).split(/\r?\n/).filter(Boolean)
  const local = new Set(manifest.files.map(file => file.path))
  const remoteSet = new Set(remoteFiles)
  const preserved = remoteFiles.filter(file => file === '.htaccess' || file.startsWith('catalog-api/'))
  const upload = manifest.files.map(file => file.path)
  const replace = upload.filter(file => remoteSet.has(file))
  const pruned = remoteFiles.filter(file => !local.has(file) && !preserved.includes(file))
  console.log(JSON.stringify({ mode: 'dry-run', remoteTarget: `${sshTarget}:${CONFIG.remoteDocumentRoot}/${CONFIG.liveDirectoryName}`, totalUploadBytes: manifest.bytes, filesToUpload: upload, filesToReplace: replace, filesPreservedFromLive: preserved, staleFilesPruned: pruned, protectedPaths: CONFIG.protectedRemotePaths, backupPlan: 'rename current staging to staging-rollback-<release-id>; retain verified Hostinger and D: WordPress backups', validationUrls: ['https://hiddentunes.com/', 'https://hiddentunes.com/artists/invalid-test-id', 'https://hiddentunes.com/albums/invalid-test-id', 'https://hiddentunes.com/tracks/invalid-test-id', 'https://hiddentunes.com/radio/stations/invalid-test-id', 'https://hiddentunes.com/catalog-api/api/radio/stations?page=1&limit=1'], remotePreflight: remote }, null, 2))
}

async function production() {
  const { manifest, remote } = await prepare()
  const releaseId = `${new Date().toISOString().replace(/[-:.]/g, '').replace('T', 'T').slice(0, 15)}Z-${run('git', ['rev-parse', '--short=8', 'HEAD'], { cwd: repositoryRoot, capture: true })}`
  await mkdir(evidenceRoot, { recursive: true })
  const manifestPath = join(evidenceRoot, `${releaseId}.manifest.json`)
  await writeFile(manifestPath, JSON.stringify({ releaseId, commit: run('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, capture: true }), createdAt: new Date().toISOString(), config: { ...CONFIG, protectedRemotePaths: CONFIG.protectedRemotePaths }, remotePreflight: remote, ...manifest }, null, 2))
  const archivePath = join(evidenceRoot, `${releaseId}.tar.gz`)
  run('tar.exe', ['-czf', archivePath, '-C', websiteDist, '.'], { cwd: websiteDist })
  const remoteArchive = `${CONFIG.remoteDomainRoot}/.${releaseId}.tar.gz`
  run('scp', ['-P', CONFIG.sshPort, '-o', 'BatchMode=yes', archivePath, `${sshTarget}:${remoteArchive}`])
  run('scp', ['-P', CONFIG.sshPort, '-o', 'BatchMode=yes', manifestPath, `${sshTarget}:${CONFIG.remoteDomainRoot}/.${releaseId}.manifest.json`])
  const root = CONFIG.remoteDocumentRoot
  const upload = `${root}/.ht-upload-${releaseId}`
  const rollback = `${root}/staging-rollback-${releaseId}`
  ssh(`set -eu; test -d "${root}/staging"; test -f "${root}/staging/.htaccess"; test -d "${root}/staging/catalog-api"; test ! -e "${upload}"; test ! -e "${rollback}"; mkdir "${upload}"; tar -xzf "${remoteArchive}" -C "${upload}"; test -f "${upload}/index.html"; cp -a "${root}/staging/.htaccess" "${upload}/.htaccess"; cp -a "${root}/staging/catalog-api" "${upload}/catalog-api"; test -f "${upload}/.htaccess"; test -d "${upload}/catalog-api"; mv "${root}/staging" "${rollback}"; if mv "${upload}" "${root}/staging"; then rm -f "${remoteArchive}" "${CONFIG.remoteDomainRoot}/.${releaseId}.manifest.json"; else mv "${rollback}" "${root}/staging"; exit 1; fi`, false)
  console.log(JSON.stringify({ mode: 'production', releaseId, previousRelease: basename(rollback), manifestPath, remoteTarget: `${root}/staging` }, null, 2))
}

function rollback() {
  const releaseId = args[1]
  if (!/^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}$/.test(releaseId || '')) throw new Error('A valid release-id is required')
  assertConfiguration()
  const root = CONFIG.remoteDocumentRoot
  const previous = `${root}/staging-rollback-${releaseId}`
  const failed = `${root}/staging-failed-${new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15)}Z`
  ssh(`set -eu; test -d "${root}/staging"; test -d "${previous}"; test -f "${previous}/index.html"; mv "${root}/staging" "${failed}"; if mv "${previous}" "${root}/staging"; then :; else mv "${failed}" "${root}/staging"; exit 1; fi`, false)
  console.log(JSON.stringify({ mode: 'rollback', restoredRelease: releaseId, displacedRelease: basename(failed) }, null, 2))
}

if (mode === '--dry-run') await dryRun()
else if (mode === '--production') await production()
else rollback()
