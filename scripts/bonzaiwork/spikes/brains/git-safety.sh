#!/usr/bin/env bash
# Fase 0 of docs/bonzaiwork/project-breinen-plan.md (§7.4, laag 4): with the
# options the sync always passes, hooks and a fsmonitor that someone (or the
# AI) put in .git do not run; without them they do. Same git semantics as the
# bundled dugite; pass GIT=/path/to/git to try another one.
#
#   bash scripts/bonzaiwork/spikes/brains/git-safety.sh
set -u
GIT=${GIT:-git}
W=$(mktemp -d)
trap 'rm -rf "$W"' EXIT
mkdir -p "$W/repo" "$W/no-hooks"
export HOME="$W" GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null GIT_TERMINAL_PROMPT=0 \
  GIT_AUTHOR_NAME=probe GIT_AUTHOR_EMAIL=probe@example.invalid GIT_COMMITTER_NAME=probe GIT_COMMITTER_EMAIL=probe@example.invalid
SAFE=(-c "core.hooksPath=$W/no-hooks" -c core.fsmonitor=false -c commit.gpgsign=false)
cd "$W/repo" && "$GIT" init -q
for hook in pre-commit commit-msg post-commit reference-transaction; do
  printf '#!/bin/sh\ntouch "%s/ran-%s"\n' "$W" "$hook" > ".git/hooks/$hook" && chmod +x ".git/hooks/$hook"
done
printf '#!/bin/sh\ntouch "%s/ran-fsmonitor"\nexit 1\n' "$W" > "$W/fsmonitor" && chmod +x "$W/fsmonitor"
"$GIT" config core.fsmonitor "$W/fsmonitor"
echo x > a.md

attempt() { # $1 label, rest: extra git options
  local label=$1; shift
  rm -f "$W"/ran-*
  "$GIT" "$@" status --porcelain > /dev/null
  "$GIT" "$@" add -A
  "$GIT" "$@" commit -q --allow-empty -m "$label"
  local ran; ran=$(cd "$W" && ls ran-* 2>/dev/null | sed 's/^ran-//' | tr '\n' ' ')
  echo "$label: ${ran:-niets uitgevoerd}"
}
attempt "met de opties van de sync" "${SAFE[@]}"
attempt "zonder" -c commit.gpgsign=false
