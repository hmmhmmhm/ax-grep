#!/bin/sh
set -eu

skill_name="ax-grep-cli"
target_root="${CODEX_HOME:-"$HOME/.codex"}/skills"
target_dir="$target_root/$skill_name"
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" 2>/dev/null && pwd)
local_skill="$script_dir/skills/$skill_name/SKILL.md"
remote_skill="${AX_GREP_SKILL_URL:-https://raw.githubusercontent.com/hmmhmmhm/ax-grep/main/skills/ax-grep-cli/SKILL.md}"

mkdir -p "$target_dir"

if [ -f "$local_skill" ]; then
  cp "$local_skill" "$target_dir/SKILL.md"
elif command -v curl >/dev/null 2>&1; then
  curl -fsSL "$remote_skill" -o "$target_dir/SKILL.md"
elif command -v wget >/dev/null 2>&1; then
  wget -qO "$target_dir/SKILL.md" "$remote_skill"
else
  echo "Could not find local skill file, curl, or wget." >&2
  exit 1
fi

echo "Installed $skill_name skill to $target_dir"
