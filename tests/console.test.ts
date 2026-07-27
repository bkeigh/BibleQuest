import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  consoleHref,
  consoleRewritePath,
  isConsoleHost,
  isConsoleRequestHost,
} from "@/lib/console/paths";
import {
  formatCount,
  formatDateTime,
  formatUsd,
  statusTone,
} from "@/lib/console/format";
import {
  parseConsoleInsights,
  parseInsightsRange,
} from "@/lib/console/insights";
import {
  formatAuditAction,
  sanitizeAuditDetails,
} from "@/lib/console/audit";

describe("console hostname routing", () => {
  it("recognizes only the dedicated production hostname", () => {
    expect(isConsoleHost("console.biblequest.co")).toBe(true);
    expect(isConsoleHost("console.biblequest.co:443")).toBe(true);
    expect(isConsoleHost("www.biblequest.co")).toBe(false);
    expect(isConsoleHost("console.biblequest.co.attacker.test")).toBe(false);
    expect(
      isConsoleRequestHost(
        "bible-quest-winterhill.vercel.app",
        "console.biblequest.co",
      ),
    ).toBe(true);
  });

  it("rewrites clean console paths without capturing shared routes", () => {
    expect(consoleRewritePath("console.biblequest.co", "/")).toBe("/console");
    expect(consoleRewritePath("console.biblequest.co", "/billing")).toBe(
      "/console/billing",
    );
    expect(consoleRewritePath("console.biblequest.co", "/insights")).toBe(
      "/console/insights",
    );
    expect(consoleRewritePath("console.biblequest.co", "/audit")).toBe(
      "/console/audit",
    );
    expect(consoleRewritePath("console.biblequest.co", "/api/health")).toBeNull();
    expect(
      consoleRewritePath("console.biblequest.co", "/auth/callback"),
    ).toBeNull();
    expect(
      consoleRewritePath("console.biblequest.co", "/icons/icon.svg"),
    ).toBeNull();
    expect(consoleRewritePath("www.biblequest.co", "/billing")).toBeNull();
    expect(
      consoleRewritePath(
        "bible-quest-winterhill.vercel.app",
        "/billing",
        "console.biblequest.co",
      ),
    ).toBe("/console/billing");
  });

  it("keeps clean production links and explicit preview links distinct", () => {
    expect(consoleHref("/", true)).toBe("/");
    expect(consoleHref("/content", true)).toBe("/content");
    expect(consoleHref("/", false)).toBe("/console");
    expect(consoleHref("/content", false)).toBe("/console/content");
  });
});

describe("console presentation helpers", () => {
  it("does not turn missing data into a misleading zero", () => {
    expect(formatCount(null)).toBe("—");
    expect(formatCount(1200)).toBe("1,200");
    expect(formatUsd(null)).toBe("—");
    expect(formatUsd(1200)).toBe("$12");
  });

  it("keeps invalid timestamps and unknown states bounded", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime("not-a-date")).toBe("—");
    expect(statusTone("active")).toBe("good");
    expect(statusTone("succeeded")).toBe("good");
    expect(statusTone("denied")).toBe("warning");
    expect(statusTone("processing")).toBe("warning");
    expect(statusTone("failed")).toBe("danger");
    expect(statusTone("future_state")).toBe("neutral");
  });
});

describe("console insight contracts", () => {
  it("keeps historical queries on reviewed ranges", () => {
    expect(parseInsightsRange("7")).toBe(7);
    expect(parseInsightsRange("90")).toBe(90);
    expect(parseInsightsRange("365")).toBe(30);
    expect(parseInsightsRange("garbage")).toBe(30);
  });

  it("bounds aggregate payloads before chart rendering", () => {
    const parsed = parseConsoleInsights(
      {
        generated_at: "2026-07-26T05:00:00Z",
        daily: [
          {
            date: "2026-07-26",
            new_accounts: 2,
            onboarded_cohort: 1,
            quest_completions: 7,
            active_questers: 3,
            push_sent: 4,
            push_failed: 1,
            push_pending: 0,
          },
          { date: "not-a-date", quest_completions: 999 },
        ],
        funnel: {
          accounts_created: 2,
          onboarding_completed: 1,
          first_quest: 1,
          repeat_quest: 0,
        },
        top_quests: [
          { slug: "pray-before-you-rise", completions: 4 },
          { slug: "<script>", completions: 99 },
        ],
        totals: {
          accounts: 10,
          onboarded_accounts: 8,
          quest_completions: 7,
          active_questers: 3,
          push_sent: 4,
          push_failed: 1,
        },
        freshness: {
          latest_account: "2026-07-26T05:00:00Z",
          latest_quest: "invalid",
        },
      },
      7,
    );

    expect(parsed.daily).toHaveLength(1);
    expect(parsed.daily[0]?.questCompletions).toBe(7);
    expect(parsed.topQuests).toEqual([
      {
        slug: "pray-before-you-rise",
        title: "pray-before-you-rise",
        completions: 4,
      },
    ]);
    expect(parsed.freshness.latestQuest).toBeNull();
  });
});

describe("console audit contracts", () => {
  it("keeps details flat and humanizes machine actions", () => {
    expect(
      sanitizeAuditDetails({
        source: "console",
        attempts: 2,
        safe: true,
        nested: { secret: "discarded" },
        "bad key": "discarded",
      }),
    ).toEqual({ source: "console", attempts: 2, safe: true });
    expect(formatAuditAction("operator.sign_in")).toBe(
      "operator · sign in",
    );
  });

  it("keeps aggregate and audit database access service-role only", () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        "supabase",
        "migrations",
        "0027_console_insights_and_audit.sql",
      ),
      "utf8",
    );

    expect(migration).toContain(
      "grant execute on function public.console_insights(integer) to service_role;",
    );
    expect(migration).toContain(
      "grant select, insert on table public.console_audit_logs to service_role;",
    );
    expect(migration).not.toMatch(
      /from public\.(?:prayers|reflections)/,
    );
  });

  it("routes both new clean-host screens before the static homepage", () => {
    const config = JSON.parse(
      readFileSync(join(process.cwd(), "vercel.json"), "utf8"),
    ) as { rewrites?: Array<{ source?: string; destination?: string }> };

    expect(config.rewrites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "/insights",
          destination: "/console/insights",
        }),
        expect.objectContaining({
          source: "/audit",
          destination: "/console/audit",
        }),
      ]),
    );
  });
});
