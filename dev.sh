#!/bin/bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
cd "$(dirname "$0")"

# Load .env if it exists
[ -f .env ] && export $(grep -v '^#' .env | xargs)

npx concurrently "npx tsx watch server/index.ts" "npx vite --host"
