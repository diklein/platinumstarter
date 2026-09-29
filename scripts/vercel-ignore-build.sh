#!/usr/bin/env bash
#
# Vercel "Ignored Build Step" — wired via vercel.json "ignoreCommand".
# Contract (per Vercel docs): exit 0 => SKIP the build, exit 1 => BUILD.
#
# Skips a production build when every file changed since the last successful
# deploy is bookkeeping that can't change what the site renders:
#   - .claude/                 (agent skills and settings)
#   - *.md                     (docs and notes; site content is .mdx)
#   - package.json             (a version bump on its own)
#   - src/generated/changelog.json  (prebuild regenerates it from git on the next real build)
# Any change to real source, content, config, or assets triggers a build.
#
# Safe by default: whenever the diff can't be determined, we BUILD — a wasted
# build is cheap; a silently-skipped real deploy is not.

set -uo pipefail

base="${VERCEL_GIT_PREVIOUS_SHA:-}"   # last successful deploy for this branch (Vercel-provided)
head="${VERCEL_GIT_COMMIT_SHA:-HEAD}"

if [ -n "$base" ] && git cat-file -e "${base}^{commit}" 2>/dev/null; then
  range="${base} ${head}"
elif git rev-parse --verify -q "HEAD^" >/dev/null 2>&1; then
  range="HEAD^ HEAD"
else
  echo "ignore-build: no comparable base commit — building."
  exit 1
fi

changed="$(git diff --name-only $range 2>/dev/null)" || { echo "ignore-build: git diff failed — building."; exit 1; }

if [ -z "$changed" ]; then
  echo "ignore-build: no file changes — building to be safe."
  exit 1
fi

# Paths that do NOT affect the built site output.
ignore='^(\.claude/|.*\.md$|package\.json$|src/generated/changelog\.json$)'
relevant="$(printf '%s\n' "$changed" | grep -vE "$ignore" || true)"

if [ -z "$relevant" ]; then
  echo "ignore-build: only bookkeeping changed since last deploy — SKIP."
  printf '  %s\n' $changed
  exit 0
fi

echo "ignore-build: site-affecting changes — BUILD."
printf '  %s\n' $relevant
exit 1
