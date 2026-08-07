#!/usr/bin/env node
/**
 * Bundles the production build into one self-contained HTML file — the shape
 * the Claude Artifact host needs (no external requests, everything inlined).
 *
 * Fonts are embedded as base64 `@font-face` data URIs rather than stripped:
 * an artifact that silently falls back to system-ui doesn't match what ships
 * to real users, and the display typeface is a deliberate part of this
 * design. Only the "latin" subset is kept per family — Tend's copy is
 * English, and Fontsource's "latin" unicode-range already covers the
 * typographic punctuation (en/em dash, curly quotes, ellipsis) the app uses,
 * so this isn't a coverage compromise, just a size one. The other five
 * subsets per family (cyrillic, cyrillic-ext, greek, greek-ext, vietnamese)
 * are dropped entirely rather than shipped unused.
 *
 * Usage:
 *   npm run build && node scripts/build-standalone.mjs [outfile]
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIST = fileURLToPath(new URL('../dist', import.meta.url))
const ASSETS = join(DIST, 'assets')
const OUT = process.argv[2] ?? join(DIST, 'standalone.html')

// Exactly which physical file is "the latin subset" for each family — kept
// as an explicit allow-list rather than inferred, so a Fontsource version
// bump that renames files fails loudly (via findAsset below) instead of
// silently shipping every subset or none at all.
const LATIN_SUBSETS = [/^inter-latin-wght-normal-/, /^literata-latin-opsz-normal-/]

function findAsset(pattern) {
  const file = readdirSync(ASSETS).find((f) => pattern.test(f))
  if (!file) throw new Error(`No dist asset matching ${pattern}`)
  return join(ASSETS, file)
}

function toDataUri(path) {
  return `data:font/woff2;base64,${readFileSync(path).toString('base64')}`
}

let css = readFileSync(findAsset(/^index-.*\.css$/), 'utf8')
let js = readFileSync(findAsset(/^index-.*\.js$/), 'utf8')

// A single-file artifact can't serve /sw.js or /manifest.webmanifest — skip
// registration rather than ship a guaranteed 404 in the console. The app
// works identically without it; the service worker only helps offline load
// of the *hosted* PWA.
const swGuard = js.replace('"serviceWorker"in navigator', 'false')
if (swGuard === js) throw new Error('Service-worker registration guard not found — main.tsx may have changed')
js = swGuard

let kept = 0
let dropped = 0

css = css.replace(/@font-face\{[^}]*\}/g, (block) => {
  const match = block.match(/url\(\/assets\/([^)]+\.woff2)\)/)
  if (!match) return block // not a woff2 @font-face block (shouldn't happen here) — leave as-is

  const filename = match[1]
  const isLatin = LATIN_SUBSETS.some((re) => re.test(filename))
  if (!isLatin) {
    dropped++
    return ''
  }

  kept++
  const dataUri = toDataUri(join(ASSETS, filename))
  return block.replace(`/assets/${filename}`, dataUri)
})

if (kept !== LATIN_SUBSETS.length) {
  throw new Error(`Expected to keep ${LATIN_SUBSETS.length} font blocks, kept ${kept}. Check LATIN_SUBSETS against dist/assets.`)
}
console.log(`Fonts: embedded ${kept} latin subsets, dropped ${dropped} unused subsets.`)

// The Artifact host supplies <!doctype>, <html>, <head> and <body> — this
// file is page content only.
const html = `<title>Tend</title>
<style>
${css}
</style>

<div id="root"></div>

<script type="module">
${js}
</script>
`

writeFileSync(OUT, html)
const kb = Math.round(Buffer.byteLength(html) / 1024)
console.log(`Wrote ${OUT} (${kb} KB)`)
