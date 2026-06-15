import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const appPath = path.join(root, 'src/App.tsx')
const cssPath = path.join(root, 'src/App.css')

let app = fs.readFileSync(appPath, 'utf8')
app = app.replace(/,?\s*artPosition:\s*'[^']*'/g, '')
app = app.replace(/^\s*artPosition:.*,\n/gm, '')
fs.writeFileSync(appPath, app.trimEnd() + '\n')

let css = fs.readFileSync(cssPath, 'utf8')
css = css.replace(
  /background-size:\s*(?:1[1-9]|[2-9]\d|\d{3,})%(?:\s+auto)?;/g,
  'background-size: cover;',
)
css = css.replace(/background-position:\s*\d+%\s+\d+%;/g, 'background-position: center;')
css = css.replace(/object-position:\s*center\s+32%;/g, 'object-position: center;')
css = css.replace(
  /\.emotional-worlds-hero-backdrop\s*\{[^}]+\}/s,
  `.emotional-worlds-hero-backdrop {
  position: absolute;
  inset: 0;
  overflow: hidden;
}`,
)
css = css.replace(
  /@media \(min-width: 1500px\) \{\s*\.page-view\[data-page="mood"\] \.emotional-worlds-hero,\s*\.page-view\[data-page="mood"\] \.emotional-worlds-hero-copy \{\s*min-height: clamp\(280px, 30vh, 320px\);\s*\}\s*\.emotional-worlds-hero-backdrop \{\s*background-size: cover;\s*background-position: center;\s*\}/s,
  `@media (min-width: 1500px) {
  .page-view[data-page="mood"] .emotional-worlds-hero,
  .page-view[data-page="mood"] .emotional-worlds-hero-copy {
    min-height: clamp(280px, 30vh, 320px);
  }`,
)
fs.writeFileSync(cssPath, css)

console.log('Phase 44D cleanup complete')
