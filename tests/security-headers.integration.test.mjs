import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { once } from "node:events";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("..", import.meta.url));
const nextBin = fileURLToPath(
  new URL("../node_modules/next/dist/bin/next", import.meta.url),
);
const approvedFrameAncestors = [
  "'self'",
  "https://winterhill.studio",
  "https://www.winterhill.studio",
];
const isolatedDevDistDir = ".next-header-test";

function parseCsp(value) {
  const directives = new Map();
  for (const rawDirective of value.split(";")) {
    const [name, ...sources] = rawDirective.trim().split(/\s+/).filter(Boolean);
    if (!name) continue;
    assert.equal(directives.has(name), false, `duplicate CSP directive: ${name}`);
    directives.set(name, sources);
  }
  return directives;
}

function assertIncludes(directives, name, expected) {
  const actual = directives.get(name);
  assert.ok(actual, `missing ${name}`);
  for (const source of expected) {
    assert.ok(actual.includes(source), `${name} must include ${source}`);
  }
}

function assertSharedSecurityContract(response, production) {
  assert.equal(response.headers.get("x-powered-by"), null);

  const rawCsp = response.headers.get("content-security-policy");
  assert.ok(rawCsp, "response must include Content-Security-Policy");
  const csp = parseCsp(rawCsp);

  assert.deepEqual(csp.get("frame-ancestors"), approvedFrameAncestors);
  assert.equal(csp.get("frame-ancestors").some((source) => source.includes("*")), false);
  assert.equal(response.headers.get("x-frame-options"), null);

  assertIncludes(csp, "script-src", [
    "https://tally.so",
  ]);
  assertIncludes(csp, "connect-src", [
    "https://header-fixture.supabase.co",
  ]);
  assertIncludes(csp, "frame-src", ["https://tally.so"]);
  assert.deepEqual(csp.get("img-src"), ["'self'", "data:", "blob:"]);
  assert.deepEqual(csp.get("font-src"), ["'self'"]);
  assert.deepEqual(csp.get("media-src"), ["'self'", "blob:"]);

  assert.equal(rawCsp.includes("https://api.rc-backup.com"), false);
  assert.equal(/revenuecat|stripe|link\.com/i.test(rawCsp), false);
  assert.equal(rawCsp.includes("https://*.supabase.co"), false);
  assert.equal(rawCsp.includes("wss://*.supabase.co"), false);
  assert.equal(
    response.headers.get("x-permitted-cross-domain-policies"),
    "none",
  );

  if (production) {
    assert.equal(response.headers.get("strict-transport-security"), "max-age=15552000");
    assert.equal(csp.get("script-src").includes("'unsafe-eval'"), false);
    assert.deepEqual(csp.get("upgrade-insecure-requests"), []);
  } else {
    assert.equal(response.headers.get("strict-transport-security"), null);
    assert.ok(csp.get("script-src").includes("'unsafe-eval'"));
    assert.equal(csp.has("upgrade-insecure-requests"), false);
  }
}

async function availablePort() {
  const server = createServer();
  server.unref();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const port = address.port;
  server.close();
  await once(server, "close");
  return port;
}

async function waitForResponse(child, url, logs) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready.\n${logs.join("")}`);
    }
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status > 0) return response;
    } catch {
      // The server has not bound the port yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}.\n${logs.join("")}`);
}

async function stop(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  const force = setTimeout(() => child.kill("SIGKILL"), 5_000);
  force.unref();
  await once(child, "exit");
  clearTimeout(force);
}

async function withNextServer(command, callback) {
  const port = await availablePort();
  const logs = [];
  const child = spawn(
    process.execPath,
    [nextBin, command, "--hostname", "127.0.0.1", "--port", String(port)],
    {
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: command === "dev" ? "development" : "production",
        BIBLEQUEST_HEADER_TEST_DIST_DIR:
          command === "dev" ? isolatedDevDistDir : "",
        NEXT_PUBLIC_SUPABASE_URL: "https://header-fixture.supabase.co",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
  child.stderr.on("data", (chunk) => logs.push(chunk.toString()));

  try {
    const response = await waitForResponse(child, `http://127.0.0.1:${port}/`, logs);
    await callback(response, logs);
  } finally {
    await stop(child);
    if (command === "dev") {
      rmSync(join(root, isolatedDevDistDir), { recursive: true, force: true });
    }
  }
}

test(
  "a production Next.js response serves the hardened header contract",
  { timeout: 120_000 },
  async () => {
    assert.ok(
      existsSync(new URL("../.next/BUILD_ID", import.meta.url)),
      "missing production build; run pnpm build first (or pnpm test:headers)",
    );
    await withNextServer("start", (response) => {
      assert.ok(response.status >= 200 && response.status < 400);
      assertSharedSecurityContract(response, true);
    });
  },
);

test(
  "a development Next.js response keeps HSTS out and unsafe-eval scoped to dev",
  { timeout: 120_000 },
  async () => {
    await withNextServer("dev", async (response, logs) => {
      const body = await response.text();
      assert.ok(
        response.status >= 200 && response.status < 400,
        `development server returned ${response.status}\n${body}\n${logs.join("")}`,
      );
      assertSharedSecurityContract(response, false);
    });
  },
);
