#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import {
  SYNTHETIC_ISSUE_MARKER,
  syntheticIncidentAction,
  syntheticIncidentBody,
} from "./lib/synthetic-health.mjs";

const TITLE = "Daily synthetic health failure";

async function github(path, init = {}) {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  if (!token || !repository || !/^[^/]+\/[^/]+$/.test(repository)) {
    throw new Error("GitHub issue configuration unavailable.");
  }
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
      ...init.headers,
    },
  });
  if (!response.ok) throw new Error("GitHub issue update failed.");
  return response.status === 204 ? null : response.json();
}

/** Creates, updates, or closes the one marker-bound incident issue. */
async function main() {
  const reportPath =
    process.argv[2] || "artifacts/synthetic-health/report.json";
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  const issues = await github("/issues?state=open&per_page=100");
  const openIssues = Array.isArray(issues)
    ? issues.filter((issue) => !issue.pull_request)
    : [];
  const decision = syntheticIncidentAction(report, openIssues);

  if (decision.action === "create") {
    await github("/issues", {
      method: "POST",
      body: JSON.stringify({
        title: TITLE,
        body: syntheticIncidentBody(report),
      }),
    });
  } else if (decision.action === "update") {
    await github(`/issues/${decision.issue.number}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: TITLE,
        body: syntheticIncidentBody(report),
      }),
    });
  } else if (decision.action === "recover") {
    await github(`/issues/${decision.issue.number}/comments`, {
      method: "POST",
      body: JSON.stringify({
        body: `${SYNTHETIC_ISSUE_MARKER}\nRecovered at \`${report.generated_at}\` on release \`${report.release_sha ?? "unavailable"}\`.`,
      }),
    });
    await github(`/issues/${decision.issue.number}`, {
      method: "PATCH",
      body: JSON.stringify({ state: "closed", state_reason: "completed" }),
    });
  }
  process.stdout.write(`Synthetic incident action: ${decision.action}.\n`);
}

await main();
