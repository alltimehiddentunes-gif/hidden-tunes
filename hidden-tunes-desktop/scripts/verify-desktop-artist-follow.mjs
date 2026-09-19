import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const auth = read('src/services/desktopSupabaseAuth.ts')
const app = read('src/App.tsx')
const api = read('src/services/artistProfileApi.ts')
const main = read('electron/main.js')
const preload = read('electron/preload.js')
const dialog = read('src/components/account/SignInDialog.tsx')
const gate = read('src/components/account/AccountRequiredDialog.tsx')
const vite = read('vite.config.ts')
const backend = read('../hidden-tunes-backend/hidden-tunes-admin/lib/artistCatalog.ts')
const route = read('../hidden-tunes-backend/hidden-tunes-admin/app/api/artists/[ref]/follow/route.ts')
const migration = read('../hidden-tunes-backend/hidden-tunes-admin/supabase/migrations/20260713150000_artist_profile_infrastructure.sql')

const checks = [
  ['same Supabase public config', vite.includes('NEXT_PUBLIC_SUPABASE_URL') && vite.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY')],
  ['no service role in Desktop', !`${auth}${app}${api}${main}${preload}${vite}`.includes('SERVICE_ROLE')],
  ['OS encrypted session storage', main.includes('safeStorage.encryptString') && auth.includes('secureDesktopStorage')],
  ['session persistence and refresh', auth.includes('persistSession: true') && auth.includes('autoRefreshToken: true')],
  ['signed-out opens auth path', app.includes("resolveAccountGate('follow'") && app.includes('openSignIn()')],
  ['canonical profile UUID mutation', app.includes('profileShell?.artist.id') && api.includes('/follow')],
  ['Electron profile bridge avoids browser CORS', main.includes('ht-artist-profile-request') && api.includes('hiddenTunesDesktop?.artistProfile')],
  ['rapid tap suppression', app.includes('followInFlightRef.current || followBusy')],
  ['recoverable optimistic rollback', app.includes('setIsFollowing(previousFollowing)') && app.includes('Try again')],
  ['expired auth response handled', app.includes('status === 401')],
  ['idempotent backend upsert', backend.includes('ignoreDuplicates: true') && backend.includes('onConflict: "artist_id,user_id"')],
  ['idempotent backend delete', backend.includes('.eq("artist_id", canonicalId)') && backend.includes('.eq("user_id", userId)')],
  ['authenticated mutations only', route.includes('Authentication required to follow') && route.includes('Authentication required to unfollow')],
  ['composite immutable identity', migration.includes('primary key (artist_id, user_id)') && migration.includes('artist_id uuid not null references public.artists(id)')],
  ['RLS remains enabled', migration.includes('alter table public.artist_followers enable row level security') && migration.includes('auth.uid() = user_id')],
  ['modal semantics and escape', dialog.includes('aria-modal="true"') && dialog.includes("event.key === 'Escape'")],
  ['focus trap and restoration', dialog.includes("event.key === 'Tab'") && gate.includes('returnFocusRef.current?.focus()')],
  ['player continuity copy/ownership', dialog.includes('does not remount playback') && dialog.includes('Playback continues')],
]

let failed = 0
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`)
  if (!ok) failed += 1
}
if (failed) process.exit(1)
