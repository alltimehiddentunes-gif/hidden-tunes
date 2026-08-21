import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const ts = await readFile(join(root, 'src/legal/privacyPolicyContent.ts'), 'utf8')
const js = ts
  .replace('export const PRIVACY_POLICY_META', 'const PRIVACY_POLICY_META')
  .replace('} as const', '}')
  .replace(/export const PRIVACY_POLICY_SECTIONS:[\s\S]*? = /, 'const PRIVACY_POLICY_SECTIONS = ')
  + '\nreturn { PRIVACY_POLICY_META, PRIVACY_POLICY_SECTIONS };'

const { PRIVACY_POLICY_META: meta, PRIVACY_POLICY_SECTIONS: sections } = Function(js)()
const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const body = sections.map((section) => [
  `<section id="${escape(section.id)}">`,
  `<h2>${escape(section.title)}</h2>`,
  ...section.paragraphs.map((paragraph) => `<p>${escape(paragraph)}</p>`),
  '</section>',
].join('')).join('\n')

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Privacy Policy · Hidden Tunes</title>
  <link rel="icon" type="image/png" href="/brand/hidden-tunes-mark.png" />
  <link rel="canonical" href="${escape(meta.canonicalUrl)}" />
  <meta name="description" content="Hidden Tunes privacy policy for the iOS and Android apps com.hiddentunes.app, including authentication, activity, playback, security, retention and account deletion." />
  <style>
    :root { color-scheme: dark; }
    body { margin:0; background:#07060b; color:#f4f1ff; font:16px/1.65 Inter,system-ui,sans-serif; }
    header { position:sticky; top:0; display:flex; justify-content:space-between; align-items:center; gap:12px; min-height:64px; padding:10px 20px; border-bottom:1px solid rgba(185,167,255,.28); background:rgba(7,6,11,.94); }
    header a { color:#dcd6f2; text-decoration:none; }
    .brand { display:flex; align-items:center; gap:10px; color:#fff; font-weight:700; }
    .brand img { width:32px; height:32px; }
    main { width:min(760px, calc(100% - 32px)); margin:28px auto 72px; }
    article { padding:28px 24px; border:1px solid rgba(185,167,255,.28); border-radius:18px; background:#12101a; }
    .kicker { margin:0 0 8px; color:#cbb8ff; letter-spacing:.12em; text-transform:uppercase; font-size:.72rem; }
    h1 { margin:0 0 8px; font-size:clamp(1.8rem,6vw,2.6rem); }
    h2 { margin:28px 0 10px; font-size:1.15rem; }
    p, .meta { color:#b7b3c9; }
    a { color:#d7c6ff; }
    @media (max-width: 720px) {
      header nav { display:flex; flex-wrap:wrap; gap:12px; justify-content:flex-end; }
      article { padding:22px 16px; }
    }
  </style>
</head>
<body>
  <header>
    <a class="brand" href="/"><img src="/brand/hidden-tunes-official.png" alt="" /><span>Hidden Tunes</span></a>
    <nav aria-label="Public website">
      <a href="/">Home</a>
      <a href="/about">About</a>
      <a href="/download">Download</a>
      <a href="/privacy" aria-current="page">Privacy</a>
      <a href="/music">Open Hidden Tunes</a>
    </nav>
  </header>
  <main>
    <article>
      <p class="kicker">Legal</p>
      <h1>Privacy Policy</h1>
      <p class="meta">Hidden Tunes · iOS and Android identifier ${escape(meta.packageId)} · Effective ${escape(meta.effectiveDate)}</p>
      ${body}
      <p>Privacy contact: ${escape(meta.contactEmail)}</p>
    </article>
  </main>
</body>
</html>
`

await writeFile(join(root, 'public/privacy.html'), html)
console.log(`wrote public/privacy.html (${html.length} bytes)`)
