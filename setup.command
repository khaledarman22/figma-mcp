#!/bin/zsh -l
# Double-click in Finder to install figma-mcp into your AI tools (same as `npm run setup`).
# It works from wherever this folder is — run it again after moving the folder.
cd "${0:A:h}" || exit 1
if command -v node >/dev/null 2>&1; then
  node scripts/setup.mjs "$@"
else
  echo "Node.js is needed: install it from https://nodejs.org (or: brew install node), then double-click this again."
fi
echo
read -s -k 1 "?Press any key to close this window."
