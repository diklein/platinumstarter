#!/usr/bin/env node
/**
 * generate-seo.mjs — AI SEO meta-description generator.
 *
 * Finds `type: article` posts with a missing or thin `description` frontmatter field, asks
 * Claude to write a 150–160 character meta description from the title + body, and injects it
 * into the frontmatter right after the `title:` line. Consumed by `writing/[slug]/page.tsx`
 * (generateMetadata uses `post.description ?? post.excerpt`) and flagged by content-review Check D.
 *
 * Usage:
 *   node scripts/generate-seo.mjs [file1.mdx ...]   # specific files
 *   node scripts/generate-seo.mjs                    # all writing MDX files
 *   node scripts/generate-seo.mjs --dry-run          # preview, write nothing
 *
 * Safety rules:
 *   - Only touches `type: article` posts
 *   - Never overwrites an existing description of 50+ characters (respects hand-written copy)
 *   - Individual errors are logged — the run continues
 *   - Requires the key for the provider in site.intelligence (ANTHROPIC_API_KEY by default;
 *     see scripts/lib/ai.mjs)
 */

import { readFile, writeFile, readdir } from 'fs/promises'
import { join, resolve, isAbsolute, basename } from 'path'
import matter from 'gray-matter'
import { generateText } from 'ai'
import { intelligenceEnabled, model } from './lib/ai.mjs'

const CWD = process.cwd()
const WRITING_DIR = join(CWD, 'src', 'content', 'writing')

const MIN_KEEP = 50   // keep an existing description this long or longer (respect hand-written copy)
const TARGET_MIN = 150
const TARGET_MAX = 160

// intelligence.seo off means this script has nothing to do; it says so before the key check,
// so a workflow step stays green with no key at all.
if (!intelligenceEnabled('seo')) {
  console.log('generate-seo: off (intelligence.seo is false in site.config.ts); nothing to do')
  process.exit(0)
}

// The provider and model come from site.intelligence (scripts/lib/ai.mjs); a missing key for
// the chosen provider exits here, before any file is read.
let seoModel
try {
  seoModel = model('capable')
} catch (err) {
  process.stderr.write(`Error: ${err.message}\n`)
  process.exit(1)
}

// MDX body → plain text for the model: drop JSX, import/export lines, and markdown syntax.
function toPlainText(content) {
  return content
    .replace(/<[A-Za-z][^>]*\/>/g, '')
    .replace(/<[A-Za-z][^>]*>[\s\S]*?<\/[A-Za-z][^>]*>/g, ' ')
    .replace(/^import\s.+$/gm, '')
    .replace(/^export\s.+$/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')       // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')     // links → text
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')     // reference links → text
    .replace(/^\[[^\]]+\]:\s*\S+$/gm, '')         // reference definitions
    .replace(/[*_`~>#]/g, '')                      // stray markdown punctuation
    .replace(/\s+/g, ' ')
    .trim()
}

async function generateDescription(title, bodyText) {
  const excerpt = bodyText.slice(0, 1500)
  const { text } = await generateText({
    model: seoModel,
    messages: [
      {
        role: 'user',
        content:
          `Write an SEO meta description for this blog post.\n\n` +
          `Title: ${title || '(untitled)'}\n\n` +
          `Body:\n${excerpt}\n\n` +
          `Rules:\n` +
          `- Length: between ${TARGET_MIN} and ${TARGET_MAX} characters (this is important).\n` +
          `- Specific: say what the reader will actually learn or see.\n` +
          `- Voice: the author plainly summarizing their own post. Not marketing copy, not a pitch.\n` +
          `- NEVER open with an imperative marketing verb: no "Discover", "Explore", "Learn",\n` +
          `  "Uncover", "Relive", "Unlock", "Dive into", "Find out". Start from the subject\n` +
          `  itself: a noun phrase or a plain statement.\n` +
          `- Banned AI-tell patterns: "...and why it matters", "here's how/what/why",\n` +
          `  "the magic of", "stunning", "transform", "revolutionize", "journey",\n` +
          `  neat rule-of-three lists, and em or en dashes (house rule: none in site copy).\n` +
          `- Natural prose. No keyword stuffing, no clickbait, no surrounding quotes.\n` +
          `- Don't repeat the title verbatim and don't start with "This post" or "In this article".\n` +
          `- Reply with ONLY the description, on a single line, no explanation.`,
      },
    ],
    maxOutputTokens: 120,
  })
  return text
    .trim()
    .replace(/^["']|["']$/g, '')   // strip wrapping quotes if the model added them
    .replace(/\s+/g, ' ')          // single line
    .trim()
}

// Insert `description: "..."` into the raw frontmatter, right after the `title:` line. Surgical
// (not gray-matter re-stringify) so the diff is a single added line and nothing else reflows.
function injectDescription(raw, description) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(raw)
  if (!m) return null
  const yaml = m[1]
  const value = description.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const descLine = `description: "${value}"`
  const newYaml = /^title:.*$/m.test(yaml)
    ? yaml.replace(/^(title:.*)$/m, `$1\n${descLine}`)
    : `${yaml}\n${descLine}`
  return `---\n${newYaml}\n---\n` + raw.slice(m[0].length)
}

async function processFile(filePath, dryRun) {
  let raw
  try {
    raw = await readFile(filePath, 'utf-8')
  } catch {
    process.stderr.write(`  skip (not readable): ${basename(filePath)}\n`)
    return { changed: false }
  }

  let parsed
  try {
    parsed = matter(raw)
  } catch (err) {
    process.stderr.write(`  skip (frontmatter error): ${basename(filePath)} — ${err.message}\n`)
    return { changed: false }
  }

  const { data, content } = parsed
  if (data.type !== 'article') {
    process.stdout.write(`  → skip (not an article): ${basename(filePath)}\n`)
    return { changed: false }
  }

  const existing = typeof data.description === 'string' ? data.description.trim() : ''
  if (existing.length >= MIN_KEEP) {
    process.stdout.write(`  → keep existing (${existing.length} chars): ${basename(filePath)}\n`)
    return { changed: false }
  }

  const bodyText = toPlainText(content)
  if (!bodyText) {
    process.stderr.write(`  skip (no body text): ${basename(filePath)}\n`)
    return { changed: false }
  }

  let description
  try {
    description = await generateDescription(typeof data.title === 'string' ? data.title : '', bodyText)
  } catch (err) {
    process.stderr.write(`  skip (API error): ${basename(filePath)} — ${err.message}\n`)
    return { changed: false }
  }

  if (!description) {
    process.stderr.write(`  skip (empty result): ${basename(filePath)}\n`)
    return { changed: false }
  }

  const updated = injectDescription(raw, description)
  if (!updated) {
    process.stderr.write(`  skip (no frontmatter block): ${basename(filePath)}\n`)
    return { changed: false }
  }

  const flag = description.length < TARGET_MIN || description.length > TARGET_MAX ? ` [${description.length} chars — outside ${TARGET_MIN}–${TARGET_MAX}]` : ''
  process.stdout.write(`  ✓ ${basename(filePath)} (${description.length} chars)${flag}: ${description}\n`)

  if (!dryRun) await writeFile(filePath, updated, 'utf-8')
  return { changed: true }
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  let filePaths = args.filter((a) => !a.startsWith('--')).filter((a) => a.endsWith('.mdx') || a.endsWith('.md'))

  if (filePaths.length === 0) {
    const entries = await readdir(WRITING_DIR).catch(() => [])
    filePaths = entries.filter((e) => e.endsWith('.mdx')).map((e) => join(WRITING_DIR, e))
  }

  if (dryRun) process.stdout.write('DRY RUN — no files will be written\n\n')

  let changed = 0
  for (const fp of filePaths) {
    const absPath = isAbsolute(fp) ? fp : resolve(CWD, fp)
    const result = await processFile(absPath, dryRun)
    if (result.changed) changed++
  }

  process.stdout.write(`\n${dryRun ? '[dry run] ' : ''}Done: ${changed} description(s) ${dryRun ? 'would be' : ''} generated across ${filePaths.length} file(s)\n`)
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err.message}\n`)
  process.exit(1)
})
