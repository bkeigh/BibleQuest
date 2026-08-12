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

# Use Xcode Cloud's increasing run number as Apple's unique bundle build string.
cloud_build_number="${CI_BUILD_NUMBER:?CI_BUILD_NUMBER is required}"
if [[ "$cloud_build_number" != <-> ]] || (( cloud_build_number < 1 )); then
  echo "Invalid CI_BUILD_NUMBER: expected a positive integer." >&2
  exit 1
fi
(
  cd ios/App
  xcrun agvtool new-version -all "$cloud_build_number"
)

# Leave release policy in the tested commands and select exactly one profile.
node --version
pnpm --version
pnpm install --frozen-lockfile
case "${BIBLEQUEST_IOS_BUILD_PROFILE:-guest}" in
  guest)
    pnpm ios:release:prepare
    ;;
  account-us)
    : "${BIBLEQUEST_IOS_ACCOUNT_US_PUBLISHABLE_KEY:?Account-US public key is required}"
    pnpm ios:account-us:prepare
    ;;
  *)
    echo "Invalid BIBLEQUEST_IOS_BUILD_PROFILE." >&2
    exit 1
    ;;
esac
