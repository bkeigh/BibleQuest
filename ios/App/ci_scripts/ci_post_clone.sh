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

# Leave release policy in the tested command and expose only safe version evidence.
node --version
pnpm --version
pnpm install --frozen-lockfile

# Guest is the default for every workflow, so merging to main can never upload
# an account-enabled binary on its own — required by
# docs/IOS_ACCOUNT_REPLACEMENT_RELEASE.md section 4. Only a workflow named
# exactly for the account replacement takes the other path, and only when its
# reviewed publishable key is present.
ACCOUNT_WORKFLOW_NAME="BibleQuest Account Release"
current_workflow="${CI_WORKFLOW:-}"

if [[ "$current_workflow" != "$ACCOUNT_WORKFLOW_NAME" ]]; then
  echo "Workflow '${current_workflow:-<unset>}': building the guest profile."
  pnpm ios:release:prepare
  exit 0
fi

echo "Workflow '$current_workflow': building the account replacement profile."

# build-native.mjs reads this from .env.account-release.local and refuses any
# key whose SHA-256 does not match the reviewed target manifest. Supply it as a
# secret Xcode Cloud environment variable; never echo it.
if [[ -z "${BIBLEQUEST_IOS_ACCOUNT_RELEASE_PUBLISHABLE_KEY:-}" ]]; then
  echo "BIBLEQUEST_IOS_ACCOUNT_RELEASE_PUBLISHABLE_KEY is required for the" >&2
  echo "account replacement workflow. Add it as a secret environment" >&2
  echo "variable on that workflow in App Store Connect." >&2
  exit 1
fi

# The file must contain exactly this one assignment; the build validates that.
umask 077
printf 'BIBLEQUEST_IOS_ACCOUNT_RELEASE_PUBLISHABLE_KEY=%s\n' \
  "$BIBLEQUEST_IOS_ACCOUNT_RELEASE_PUBLISHABLE_KEY" \
  > .env.account-release.local

pnpm ios:account-release:prepare
