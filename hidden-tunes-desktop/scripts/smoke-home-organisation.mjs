#!/usr/bin/env node
/**
 * Alias: Home organisation smoke delegates to smoke-home-music-integration.mjs
 * Run: node scripts/smoke-home-organisation.mjs
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const target = path.join(root, 'smoke-home-music-integration.mjs')
const child = spawn('npx', ['electron', target], {
  cwd: path.resolve(root, '..'),
  stdio: 'inherit',
  shell: true,
})
child.on('exit', (code) => process.exit(code ?? 1))
