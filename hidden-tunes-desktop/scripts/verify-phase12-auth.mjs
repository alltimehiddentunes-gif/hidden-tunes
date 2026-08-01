/**
 * Phase 12 — Authentication foundation contracts (static).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')

let passed = 0
let failed = 0
function check(label, cond, detail = '') {
  if (cond) {
    passed += 1
    console.log(`PASS: ${label}${detail ? ` — ${detail}` : ''}`)
  } else {
    failed += 1
    console.error(`FAIL: ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

const auth = read('src/services/desktopSupabaseAuth.ts')
const provider = read('src/context/DesktopAuthProvider.tsx')
const dialog = read('src/components/account/SignInDialog.tsx')
const gate = read('src/lib/account/accountGate.ts')
const gateUi = read('src/components/account/AccountRequiredDialog.tsx')
const app = read('src/App.tsx')
const mutex = read('src/context/DesktopPlaybackProvider.tsx')

check('signInWithPassword present', auth.includes('signInWithPassword'))
check('signUp present', auth.includes('signUp(') || auth.includes('auth.signUp'))
check('signOut present', auth.includes('signOut'))
check('password reset present', auth.includes('resetPasswordForEmail'))
check('no service role in auth helper', !/service[_-]?role/i.test(auth) || auth.includes('never service-role'))
check('auth provider wraps app', app.includes('DesktopAuthProvider'))
check('sign-in dialog exists', dialog.includes('SignInDialog') || dialog.includes('account-auth-dialog'))
check('gate offers sign-in CTA', gateUi.includes('onSignIn') && gate.includes('showSignIn'))
check('follow uses configured sign-in UI', app.includes('signInUiAvailable: authConfigured'))
check('sidebar sign out path', app.includes('Sign out') && app.includes('openSignIn'))
check('settings account actions', app.includes('settings-account-actions'))
check('playback provider not remounted by auth dialog', provider.includes('SignInDialog') && mutex.includes('activeMediaRef'))
check('env example documents public keys only', fs.existsSync(path.join(root, '.env.example')) && !read('.env.example').includes('SERVICE_ROLE'))
check('session summary has userId', auth.includes('userId'))

console.log(`\nPhase 12 auth verify: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
