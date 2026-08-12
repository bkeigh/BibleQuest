#!/usr/bin/env node
/** Selects the one privacy manifest that the next Xcode archive will embed. */
import { copyFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2];
const profiles = {
  "--guest": "PrivacyInfo.guest.xcprivacy",
  "--account-us": "PrivacyInfo.account-us.xcprivacy",
};
const sourceName = profiles[mode];
if (!sourceName || process.argv.length !== 3) {
  throw new Error("Use --guest or --account-us exactly once.");
}

const source = path.join(repo, "ios", "compliance", sourceName);
const target = path.join(repo, "ios", "App", "App", "PrivacyInfo.xcprivacy");
const contents = readFileSync(source, "utf8");
if (mode === "--guest" && !/shipping build is\s+guest-only/i.test(contents)) {
  throw new Error("The selected guest privacy manifest is invalid.");
}
if (mode === "--account-us" && /shipping build is\s+guest-only/i.test(contents)) {
  throw new Error("The selected account privacy manifest is invalid.");
}
copyFileSync(source, target);
process.stdout.write(`[ios:privacy] selected ${sourceName}\n`);
