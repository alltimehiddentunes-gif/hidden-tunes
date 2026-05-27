import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base so packaged Electron (file://) resolves dist/assets correctly.
export default defineConfig({
  base: './',
  plugins: [react()],
})
