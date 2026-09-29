#!/usr/bin/env node
/**
 * Auto-increments the version in package.json from the commits being pushed.
 *
 * Bump level follows Conventional Commits — the HIGHEST level across all pushed
 * commits wins:
 *   major (X+1.0.0) — a `!` after the type (e.g. `feat!:`, `fix!:`) or a
 *                     `BREAKING CHANGE` footer in any commit body
 *   minor (X.Y+1.0) — any `feat:` / `feat(scope):`
 *   patch (X.Y.Z+1) — everything else (fix, perf, refactor, style, chore, docs, …)
 *
 * It analyzes `origin/main..HEAD` — the commits about to be pushed. The pre-push hook
 * runs this, then stages package.json and amends it into the last commit (no separate
 * commit). If there are no new commits, the version is left untouched.
 *
 * Only the `"version"` line is rewritten, so the diff stays a single line. No deps.
 *
 * To adjust the policy, edit bumpLevel() below.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const RANGE = 'origin/main..HEAD'

/** Full messages (subject + body) of the commits about to be pushed, newest first. */
function commitsToAnalyze() {
  try {
    // \x1e (record separator) delimits commits so bodies with blank lines stay intact.
    const raw = execSync(`git log --format=%B%x1e ${RANGE}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    })
    return raw.split('\x1e').map((s) => s.trim()).filter(Boolean)
  } catch {
    // origin/main missing (e.g. first push) or git error — don't guess, don't bump.
    return []
  }
}

function bumpLevel(commits) {
  let level = 'patch'
  for (const msg of commits) {
    const subject = msg.split('\n', 1)[0]
    // Match the breaking marker only as a real footer (start of a line, followed by a
    // colon) — not a passing mention of the phrase in prose, which would over-fire.
    if (/^[a-z]+(\([^)]+\))?!:/.test(subject) || /^BREAKING[ -]CHANGE:/m.test(msg)) return 'major'
    if (/^feat(\([^)]+\))?:/.test(subject)) level = 'minor'
  }
  return level
}

function nextVersion(current, level) {
  const [maj, min, pat] = current.split('.').map(Number)
  if (level === 'major') return `${maj + 1}.0.0`
  if (level === 'minor') return `${maj}.${min + 1}.0`
  return `${maj}.${min}.${pat + 1}`
}

const commits = commitsToAnalyze()
if (commits.length === 0) {
  console.log('version: no new commits to push — unchanged.')
  process.exit(0)
}

const pkgPath = new URL('../package.json', import.meta.url)
const text = readFileSync(pkgPath, 'utf8')
const current = JSON.parse(text).version
const level = bumpLevel(commits)
const next = nextVersion(current, level)

writeFileSync(pkgPath, text.replace(`"version": "${current}"`, `"version": "${next}"`))
console.log(
  `version: ${current} → ${next} (${level}; ${commits.length} commit${commits.length === 1 ? '' : 's'})`,
)
