import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { PILOT_KEYS, rendererDefines, rendererSecretBoundary } from './scripts/rendererEnv'

// Relative base so packaged Electron (file://) resolves dist/assets correctly.
export default defineConfig(({ mode, command, isPreview }) => {
  const desktopEnv = loadEnv(mode, process.cwd(), '')
  const backendEnv = loadEnv(
    mode,
    path.resolve(process.cwd(), '../hidden-tunes-backend/hidden-tunes-admin'),
    '',
  )
  const supabaseUrl =
    desktopEnv.VITE_SUPABASE_URL ||
    desktopEnv.VITE_PUBLIC_SUPABASE_URL ||
    backendEnv.NEXT_PUBLIC_SUPABASE_URL ||
    backendEnv.SUPABASE_URL ||
    ''
  const supabaseAnonKey =
    desktopEnv.VITE_SUPABASE_ANON_KEY ||
    desktopEnv.VITE_PUBLIC_SUPABASE_ANON_KEY ||
    backendEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    backendEnv.SUPABASE_ANON_KEY ||
    ''

  const development = command === 'serve' && !isPreview && mode !== 'production'
  const privateValues = PILOT_KEYS.flatMap((key) => [
    desktopEnv[key], backendEnv[key], process.env[key],
  ]).filter((value): value is string => typeof value === 'string' && value.length >= 16)

  return {
    base: './',
    envPrefix: [],
    plugins: [rendererSecretBoundary(process.cwd(), privateValues), react()],
    // Only the public URL and anon key cross into the renderer bundle. Privileged
    // backend variables are never spread or exposed.
    define: {
      ...rendererDefines(desktopEnv, development),
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
    },
  }
})
