#!/bin/zsh
set -euo pipefail

# Xcode Cloud archives must prove their exact signed account or guest payload.
repository_root="${CI_PRIMARY_REPOSITORY_PATH:?CI_PRIMARY_REPOSITORY_PATH is required}"
archive_path="${CI_ARCHIVE_PATH:?CI_ARCHIVE_PATH is required}"
cloud_build_number="${CI_BUILD_NUMBER:?CI_BUILD_NUMBER is required}"
cd "$repository_root"

# Resolve exactly one top-level archived application, excluding nested frameworks.
applications_root="$archive_path/Products/Applications"
archived_apps=("$applications_root"/*.app(N))
if (( ${#archived_apps[@]} != 1 )); then
  echo "Expected exactly one archived .app under $applications_root." >&2
  exit 1
fi

# Match the profile selected by ci_post_clone.sh without weakening guest defaulting.
profile="guest"
if [[ "${CI_WORKFLOW:-}" == "BibleQuest Account Release" ]]; then
  profile="account-release"
fi

# Re-resolve HEAD so the post-build scan cannot trust mutable log metadata.
source_sha="$(git rev-parse --verify HEAD)"
node scripts/verify-ios-release-app.mjs \
  --app "${archived_apps[1]}" \
  --profile "$profile" \
  --expected-build "$cloud_build_number" \
  --expected-source "$source_sha"
