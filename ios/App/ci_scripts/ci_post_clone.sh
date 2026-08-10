#!/bin/zsh
set -euo pipefail

# Xcode Cloud starts without the JavaScript toolchain or generated Capacitor payload.
repository_root="${CI_PRIMARY_REPOSITORY_PATH:?CI_PRIMARY_REPOSITORY_PATH is required}"
cd "$repository_root"

# Match the locked toolchain used by package.json and the repository CI workflow.
if ! brew list --versions node@24 >/dev/null 2>&1; then
  brew install node@24
fi
export PATH="$(brew --prefix node@24)/bin:$PATH"

corepack enable
corepack prepare pnpm@11.10.0 --activate

# Leave policy in the tested release command and expose only safe version evidence.
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm ios:release:prepare
