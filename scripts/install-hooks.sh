#!/bin/sh
# Installs the pre-commit secret scan as a plain git hook. Idempotent: run it as often as you like.
#
#   npm run hooks:install        (or: sh scripts/install-hooks.sh)
#
# No husky, no "prepare" script: git hooks are a file in .git/hooks, and one file is all this
# needs. Because .git/hooks is not part of the clone, every fresh checkout runs this once.
#
# If a pre-commit hook that is not ours already exists it is kept as pre-commit.local and our
# hook chains to it, so nothing you had before is lost.
set -eu

cd "$(dirname "$0")/.."

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "install-hooks: not inside a git repository" >&2
  exit 1
fi

# A core.hooksPath pointing somewhere else silently disables .git/hooks (it has bitten this
# project before: a dead hooksPath disabled the changelog regen for weeks). Say so, loudly.
hooks_path="$(git config --get core.hooksPath || true)"
if [ -n "$hooks_path" ]; then
  echo "install-hooks: core.hooksPath is set to '$hooks_path'; git will run hooks from there, not .git/hooks." >&2
  echo "               Unset it (git config --unset core.hooksPath) or copy the hook there yourself." >&2
  exit 1
fi

hooks_dir="$(git rev-parse --git-path hooks)"
hook="$hooks_dir/pre-commit"
marker="# platinum:check-secrets"

mkdir -p "$hooks_dir"

if [ -f "$hook" ] && ! grep -q "$marker" "$hook"; then
  mv "$hook" "$hook.local"
  echo "install-hooks: kept your existing pre-commit hook as $hook.local (ours chains to it)"
fi

cat > "$hook" <<'EOF'
#!/bin/sh
# platinum:check-secrets
# Installed by scripts/install-hooks.sh. Re-run that script to refresh; delete this file to opt out.
set -e

# Chain to a hook that was here before ours, if any.
if [ -x "$0.local" ]; then
  "$0.local" "$@"
fi

node scripts/check-secrets.mjs
EOF
chmod +x "$hook"

echo "install-hooks: pre-commit hook installed at $hook"
