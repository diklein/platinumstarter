#!/usr/bin/env node
/**
 * PUB-04: Scaffold a new MDX post file in src/content/writing/ with pre-filled
 * frontmatter and open it in the default editor.
 *
 * Usage: npm run new-post
 *
 * Prompts for:
 *   1. Post title (required)
 *   2. Post type [article/photo/note/link] (default: article)
 *
 * Security: T-05-01 path traversal guard — slug is validated to contain only
 * [a-z0-9-] before use in the filename; resolved filepath is checked to start
 * with the expected content/writing directory before any write.
 */

import { createInterface } from 'node:readline'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import GithubSlugger from 'github-slugger'

const VALID_TYPES = ['article', 'photo', 'note', 'link']

/**
 * Wrap rl.question in a Promise so we can use async/await.
 */
function ask(rl, prompt) {
  return new Promise((resolve) => rl.question(prompt, resolve))
}

async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout })

  // Step 1: Prompt for post title (required)
  const rawTitle = await ask(rl, 'Post title: ')
  const title = rawTitle.trim()

  if (!title) {
    rl.close()
    process.stderr.write('Error: Post title is required.\n')
    process.exit(1)
  }

  // Step 2: Prompt for post type (optional, default: article)
  const rawType = await ask(rl, 'Post type [article/photo/note/link] (default: article): ')
  const typeInput = rawType.trim().toLowerCase()
  const type = VALID_TYPES.includes(typeInput) ? typeInput : 'article'

  rl.close()

  // Step 3: Derive slug via github-slugger (outputs only [a-z0-9-])
  const slug = new GithubSlugger().slug(title)

  // Step 4: Defense-in-depth slug validation (T-05-01)
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    process.stderr.write(
      `Error: Could not derive a valid slug from title "${title}". ` +
        `Slug must contain only [a-z0-9-] characters. ` +
        `Please use a title with alphanumeric characters.\n`
    )
    process.exit(1)
  }

  // Step 5: Generate today's date (YYYY-MM-DD)
  const date = new Date().toISOString().slice(0, 10)

  // Step 6: Compose filename and filepath
  const filename = `${slug}.mdx`
  const contentWritingDir = path.join(process.cwd(), 'src', 'content', 'writing')
  const filepath = path.join(contentWritingDir, filename)

  // Step 7: Path-traversal guard (T-05-01) — verify resolved path is inside content/writing
  const expectedPrefix = contentWritingDir + path.sep
  if (!filepath.startsWith(expectedPrefix) && filepath !== contentWritingDir) {
    process.stderr.write(
      `Error: Derived filepath "${filepath}" is outside the expected directory ` +
        `"${contentWritingDir}". Aborting.\n`
    )
    process.exit(1)
  }

  // Step 8: Existence check — do not overwrite existing files
  if (fs.existsSync(filepath)) {
    process.stderr.write(
      `Error: File already exists: ${filepath}\n` +
        `Choose a different title or delete the existing file before re-running.\n`
    )
    process.exit(1)
  }

  // Step 9: Build frontmatter — strip newlines then escape double-quotes in title (T-05-05)
  const safeTitle = title
    .replace(/[\r\n]/g, ' ')   // collapse newlines to spaces — prevents YAML injection
    .replace(/"/g, '\\"')       // then escape double-quotes
  const frontmatter = `---
type: ${type}
date: "${date}"
slug: ${slug}
title: "${safeTitle}"
tags: []
---

`

  // Step 10: Write file to disk
  fs.writeFileSync(filepath, frontmatter)
  process.stdout.write(`Created: src/content/writing/${filename}\n`)

  // Step 11: Resolve editor and open the file
  const editor = process.env.VISUAL || process.env.EDITOR || 'open'
  try {
    execFileSync(editor, [filepath], { stdio: 'inherit' })
  } catch (err) {
    process.stderr.write(
      `Warning: Could not open editor "${editor}": ${err.message}\n` +
        `The file was created successfully at: ${filepath}\n`
    )
  }

  process.exit(0)
}

main().catch((err) => {
  process.stderr.write(`new-post: unexpected error — ${err.message}\n`)
  process.exit(1)
})
