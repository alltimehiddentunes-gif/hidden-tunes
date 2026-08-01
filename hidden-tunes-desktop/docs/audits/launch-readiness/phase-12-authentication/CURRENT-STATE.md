# Current State / Desktop Flow / Session / Gating

- Sign in / Sign up / Reset / Sign out via desktopSupabaseAuth + SignInDialog
- Session persist: Supabase persistSession in renderer localStorage
- DesktopAuthProvider hosts dialog without remounting DesktopPlaybackProvider
- Follow gate opens Sign in when configured
- Sidebar + Settings show account identity
- Device-local likes/downloads not wiped on logout
