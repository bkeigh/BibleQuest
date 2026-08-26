import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import dailyVerses from "@/data/seed/daily-verses.json";
import { seedQuests } from "@/data/seed/quests";
import { seedMilestones } from "@/data/seed/milestones";
import { QUEST_CATEGORIES } from "@/lib/questos/types";
import { createReviewedQuestProvider } from "@/lib/quest-generation/provider";

describe("launch content catalog", () => {
  it("keeps the Home verse beneath a compact welcome and the mobile nav scroll-stable", () => {
    const home = readFileSync(
      path.join(process.cwd(), "src/components/home/HomeScreen.tsx"),
      "utf8",
    );
    const bottomNav = readFileSync(
      path.join(process.cwd(), "src/components/app-shell/BottomNav.tsx"),
      "utf8",
    );
    const installPrompt = readFileSync(
      path.join(process.cwd(), "src/components/app-shell/InstallPrompt.tsx"),
      "utf8",
    );
    const toast = readFileSync(
      path.join(process.cwd(), "src/components/design-system/Toast.tsx"),
      "utf8",
    );
    const globalStyles = readFileSync(
      path.join(process.cwd(), "src/app/globals.css"),
      "utf8",
    );

    const welcomeSurface = home.indexOf("Compact personal welcome");
    const verseEntry = home.indexOf("<TodaysVerseLink />");
    const questSection = home.indexOf('<section id="quests"');
    expect(welcomeSurface).toBeGreaterThan(-1);
    expect(verseEntry).toBeGreaterThan(welcomeSurface);
    expect(questSection).toBeGreaterThan(verseEntry);
    expect(home).toContain('href="/app/settings"');
    expect(home).toContain("aria-label={t.home.openSettings}");
    expect(home).not.toContain("data-today-profile-card");
    expect(home).not.toContain("Your profile");
    expect(home).not.toContain('name="people"');
    expect(home).not.toContain("useSession");

    // Primary destinations use the approved art library; small utility
    // controls remain crisp vectors where a painting would reduce clarity.
    expect(bottomNav).toContain("data-primary-nav-art");
    for (const sprite of ["sun", "map", "open-book", "hands", "tree"]) {
      expect(bottomNav).toContain(`sprite: "${sprite}"`);
    }
    expect(bottomNav).toContain("<ArtIcon name={sprite}");

    // Mobile Safari is sensitive to fixed + blur + transform composition.
    // Keep the base bar opaque and reserve blur for larger viewports.
    expect(bottomNav).toContain(
      "bg-parchment pb-safe sm:bg-parchment/90 sm:backdrop-blur-md",
    );
    const focusRule = globalStyles.slice(
      globalStyles.indexOf("html.bible-focus-mode [data-app-bottom-nav]"),
      globalStyles.indexOf("html {", globalStyles.indexOf("html.bible-focus-mode")),
    );
    expect(focusRule).toContain("display: none");
    expect(focusRule).not.toContain("transform:");

    // Bottom popups clear the measured nav and stack at 16px intervals.
    expect(bottomNav).toContain("--app-bottom-nav-height");
    expect(installPrompt).toContain(
      "bottom-[calc(var(--app-bottom-nav-height,5rem)+1rem)]",
    );
    expect(toast).toContain(
      "bottom-[calc(var(--app-bottom-nav-height,5rem)+var(--app-install-prompt-height,0px)+1rem)]",
    );
  });

  it("keeps Home to one compact snapshot of the canonical Quest board", () => {
    const home = readFileSync(
      path.join(process.cwd(), "src/components/home/HomeScreen.tsx"),
      "utf8",
    );

    // Home previews one relevant card; lifecycle management stays on Quests.
    expect(home).toContain('<section id="quests"');
    expect(home).toContain('href="/app/quests"');
    expect(home).toContain("{questSummary || \"Choose a quest\"}");
    expect(home).toContain("activePicks[0] ?? readyPicks[0]");
    expect(home).toContain("View all quests");
    expect(home).not.toContain("<HomeQuestDisclosure");
    expect(home).not.toContain("buildHomeQuestGroups");
    expect(home).not.toContain("completedToday");
  });

  it("uses a larger tree-only Home growth preview", () => {
    const home = readFileSync(
      path.join(process.cwd(), "src/components/home/HomeScreen.tsx"),
      "utf8",
    );

    expect(home).toContain("size={96}");
    expect(home).toContain("treeOnly");
    expect(home).not.toContain("size={76}");
  });

  it("reserves the gold Home nameplate for active Plus members", () => {
    const home = readFileSync(
      path.join(process.cwd(), "src/components/home/HomeScreen.tsx"),
      "utf8",
    );
    const globalStyles = readFileSync(
      path.join(process.cwd(), "src/app/globals.css"),
      "utf8",
    );

    // The sealed Plus projection controls both the visual state and its label.
    expect(home).toContain('data-plus-nameplate={isPlus ? "active" : "free"}');
    expect(home).toContain(
      '<span className="sr-only">BibleQuest Plus member</span>',
    );
    expect(home).toContain("BibleQuest{\" \"}");
    expect(home).toContain(
      '<strong className="font-black leading-none">+</strong>',
    );
    expect(home).toContain("whitespace-nowrap");
    expect(home).toContain('className="@max-[8rem]:hidden">✦</span>');
    expect(home).toContain('"@container min-w-0 flex-1"');
    expect(home).toContain('className="max-[340px]:w-12"');
    expect(home).toContain("plus-nameplate");
    expect(home).toContain("home-hero-surface");
    expect(home).toContain("border-[#9f6a1f]/75");
    expect(home).toContain("from-[#4d3008]");
    expect(home).toContain('tone={isPlus ? "gold" : "default"}');
    expect(home).toContain('isPlus ? "text-[#4f3108]" : "text-accent"');
    expect(home).toContain('isPlus ? "text-[#493816]" : "text-charcoal"');
    expect(home).not.toContain("subscription.status");

    // Wallpaper members always receive the Plus nameplate. Its fill therefore
    // has to remain one <=50%-opaque layer rather than stacked opaque gradients.
    const plusHeroRule = globalStyles.indexOf(
      '.home-hero-surface[data-plus-nameplate="active"]',
    );
    const plusHeroCss = globalStyles.slice(
      plusHeroRule,
      globalStyles.indexOf("}", plusHeroRule),
    );
    expect(plusHeroRule).toBeGreaterThan(-1);
    expect(globalStyles).toContain(
      'html.glass-surfaces.has-wallpaper [data-app-shell] .app-glass-surface.home-hero-surface[data-plus-nameplate="active"]',
    );
    expect(plusHeroCss).toContain("background-color: transparent");
    expect(plusHeroCss).toContain("/ 0.46");
  });

  it("keeps Home membership-aware with newsletter beneath voluntary support", () => {
    const home = readFileSync(
      path.join(process.cwd(), "src/components/home/HomeScreen.tsx"),
      "utf8",
    );

    expect(home).toContain("!isPlus &&");
    expect(home).toContain("<ExplorePlusLink");
    expect(home.indexOf("<NewsletterLink")).toBeGreaterThan(
      home.indexOf("<SupportLink"),
    );
  });

  it("keeps the generated quest panel evenly inset from its disclosure", () => {
    const browse = readFileSync(
      path.join(process.cwd(), "src/components/quests/QuestBrowse.tsx"),
      "utf8",
    );
    const generator = browse.slice(
      browse.indexOf('label="Generate a quest"'),
      browse.indexOf("{/* Filters"),
    );

    expect(generator).toContain('variant="blue"');
    expect(generator).toContain("bg-white/20");
    expect(generator).toContain('contentClassName="pt-4"');
  });

  it("uses an accessible MyShepherd blue for AI-assisted entry points", () => {
    const disclosure = readFileSync(
      path.join(
        process.cwd(),
        "src/components/design-system/Disclosure.tsx",
      ),
      "utf8",
    );
    const home = readFileSync(
      path.join(process.cwd(), "src/components/home/HomeScreen.tsx"),
      "utf8",
    );

    expect(disclosure).toContain("bg-[#3D789C]");
    // The home callout carries the blue in `.app-glass-shepherd` now rather
    // than an inline style, because an inline background out-ranks the glass
    // rule that has to tint it. Same colour, one level further out.
    expect(home).toContain("app-glass-shepherd");
    const css = readFileSync(
      path.join(process.cwd(), "src/app/globals.css"),
      "utf8",
    );
    const rule = css.slice(css.indexOf("[data-app-shell] .app-glass-shepherd"));
    expect(rule.slice(0, 240)).toContain("var(--color-marian-700)");
    expect(home).toContain("bg-[#173c52]/55");
    expect(home).not.toContain("text-white/80");
  });

  it("describes the external quest matcher without exposing private writing", () => {
    const generator = readFileSync(
      path.join(
        process.cwd(),
        "src/components/quests/QuestGenerator.tsx",
      ),
      "utf8",
    );
    const plus = readFileSync(
      path.join(process.cwd(), "src/components/plus/PlusContent.tsx"),
      "utf8",
    );

    expect(generator).toContain("human-reviewed");
    expect(generator).toContain("never reads your profile");
    expect(generator).not.toContain("It stays on this device");
    expect(plus).toContain("Private matching");
    expect(plus).not.toContain("on-device recommendations");
    // The guarantee is what the matcher can see, not which model runs it.
    // Readers have no context for a vendor model name, so it stays out of
    // every user-facing string.
    expect(generator).not.toContain("Haiku");
    expect(plus).not.toContain("Haiku");
  });

  it("gives the rhythm screen page-specific browser metadata", () => {
    const rhythmPage = readFileSync(
      path.join(process.cwd(), "src/app/app/rhythm/page.tsx"),
      "utf8",
    );

    expect(rhythmPage).toContain('title: "My Rhythm"');
    expect(rhythmPage).toContain("gentle weekly formation plan");
  });

  it("keeps Bible verse taps semantic and history aligned with the shown edition", () => {
    const reader = readFileSync(
      path.join(process.cwd(), "src/components/bible/ChapterReader.tsx"),
      "utf8",
    );
    const bibleIndex = readFileSync(
      path.join(process.cwd(), "src/components/bible/BibleIndex.tsx"),
      "utf8",
    );
    const globalStyles = readFileSync(
      path.join(process.cwd(), "src/app/globals.css"),
      "utf8",
    );
    const questDetail = readFileSync(
      path.join(process.cwd(), "src/components/quests/QuestDetail.tsx"),
      "utf8",
    );

    expect(reader).toContain("<button");
    expect(reader).not.toContain('role="button"');
    expect(reader).toContain('aria-pressed={isSel}');
    expect(reader).toContain('data-selected={isSel ? "true" : undefined}');
    expect(reader).toContain("box-decoration-clone");
    // The mark moved from a Tailwind alpha wash to theme-aware verse-mark
    // tokens; what this guards is that a tapped verse still shows one.
    expect(reader).toContain('isSel && "verse-mark-selected"');
    expect(globalStyles).toContain(':focus-visible:not([id^="verse-"])');
    expect(reader).toContain("persistableVerseText(i)");
    expect(bibleIndex).toContain("onPresentedText={recordPresentedVerse}");
    expect(questDetail).toContain("Back to Quests");
    expect(questDetail).not.toContain("Back to active quests");
  });

  it("keeps onboarding quest language aligned with the consolidated Home section", () => {
    const onboarding = readFileSync(
      path.join(process.cwd(), "src/components/onboarding/OnboardingFlow.tsx"),
      "utf8",
    );

    expect(onboarding).toContain("your quests");
    expect(onboarding).toContain("unlimited quest windows");
    expect(onboarding).not.toContain("active quests");
  });

  it("uses the approved social preview tagline", () => {
    const iconBuilder = readFileSync(
      path.join(process.cwd(), "scripts/build-icons.mjs"),
      "utf8",
    );

    expect(iconBuilder).toContain("A daily guide to living in faith");
    expect(iconBuilder).not.toContain("A daily guide to living your faith");
  });

  it("keeps Plus copy aligned with shipped benefits and Stripe-authored pricing", () => {
    const plusContent = readFileSync(
      path.join(process.cwd(), "src/components/plus/PlusContent.tsx"),
      "utf8",
    );
    const plusCta = readFileSync(
      path.join(process.cwd(), "src/components/plus/PlusCta.tsx"),
      "utf8",
    );

    expect(plusContent).toContain("Unlimited active quest windows");
    expect(plusContent).toContain("Unlimited daily verse refreshes");
    expect(plusContent).toContain("Every still and live wallpaper");
    expect(plusContent).toContain("never journals or personal writing");
    expect(plusCta).toContain("formatBillingAmount(plan)");
    expect(plusCta).toContain(
      "Monthly and annual Plus renew automatically until canceled",
    );
    expect(plusCta).toMatch(/Lifetime\s+Plus is one payment with no renewal/);
    expect(plusCta).toContain("Checkout shows the");
    expect(`${plusContent}\n${plusCta}`).not.toMatch(/\$8\.99|29¢|AI Study/i);
  });

  it("ships exactly 150 unique, reviewed free quests with useful depth", () => {
    expect(seedQuests).toHaveLength(150);
    expect(new Set(seedQuests.map((quest) => quest.slug))).toHaveLength(150);
    expect(seedQuests.every((quest) => quest.isPremium === false)).toBe(true);
    expect(seedQuests.some((quest) => quest.slug === "pray-for-three-people-by-name")).toBe(true);

    for (const category of QUEST_CATEGORIES) {
      expect(
        seedQuests.filter((quest) => quest.category === category).length,
        category,
      ).toBeGreaterThanOrEqual(10);
    }
    expect(seedQuests.filter((quest) => quest.difficulty === "devoted").length).toBeGreaterThanOrEqual(35);
    expect(seedQuests.filter((quest) => quest.durationMinutes >= 60).length).toBeGreaterThanOrEqual(55);
    expect(seedQuests.filter((quest) => quest.durationMinutes === 480).length).toBeGreaterThanOrEqual(4);
    expect(seedQuests.filter((quest) => quest.energyLevel === "high").length).toBeGreaterThanOrEqual(12);
    expect(seedQuests.every((quest) => quest.invitation.length >= 45)).toBe(true);
    expect(seedQuests.every((quest) => quest.whyItMatters.length >= 45)).toBe(true);
  });

  it("hydrates 180 unique exact WEB passages across all 66 books", () => {
    expect(dailyVerses).toHaveLength(180);
    const keys = dailyVerses.map(
      (verse) =>
        `${verse.bookSlug}:${verse.chapter}:${verse.verseStart}:${verse.verseEnd}`,
    );
    expect(new Set(keys)).toHaveLength(180);
    expect(new Set(dailyVerses.map((verse) => verse.bookSlug))).toHaveLength(66);

    const cache = new Map<string, { chapters: string[][] }>();
    for (const verse of dailyVerses) {
      let book = cache.get(verse.bookSlug);
      if (!book) {
        const loaded = JSON.parse(
          readFileSync(
            path.join(process.cwd(), "src/data/bible", `${verse.bookSlug}.json`),
            "utf8",
          ),
        ) as { chapters: string[][] };
        cache.set(verse.bookSlug, loaded);
        book = loaded;
      }
      const exact = book.chapters[verse.chapter - 1]
        .slice(verse.verseStart - 1, verse.verseEnd)
        .join(" ")
        .trim();
      expect(verse.text, verse.reference).toBe(exact);
    }
  });

  it("uses the safe local provider for Plus quest generation", async () => {
    const provider = createReviewedQuestProvider(seedQuests);
    const result = await provider.generate({
      category: "service",
      duration: 240,
      focus: "service",
      variation: 4,
    });
    expect(provider.sendsDataOffDevice).toBe(false);
    expect(result.source).toBe("reviewed_catalog");
    expect(result.quest.category).toBe("service");
    expect(result.quest.durationMinutes).toBe(240);
    expect(seedQuests).toContain(result.quest);
  });

  it("mirrors current content into an updating, non-null Console seed", () => {
    const sql = readFileSync(
      path.join(process.cwd(), "supabase/seed.sql"),
      "utf8",
    );
    const dailySection = sql.slice(
      sql.indexOf("-- Daily verse pool"),
      sql.indexOf("-- Quest templates"),
    );
    const questSection = sql.slice(sql.indexOf("-- Quest templates"));
    expect((dailySection.match(/^  \('/gm) ?? [])).toHaveLength(180);
    expect((questSection.match(/^  \('/gm) ?? [])).toHaveLength(150);
    expect(sql).toContain(
      "insert into faith_providers (key, name, description, canonical_text_label, is_active)",
    );
    expect(sql).toContain("canonical_text_label = excluded.canonical_text_label,\n  is_active = excluded.is_active;");
    expect(sql).toContain("on conflict (book_slug, chapter, verse_start, verse_end) do update");
    expect(sql).toContain("on conflict (slug) do update set");
    expect(sql).toContain("scripture_text_snapshot = excluded.scripture_text_snapshot");
    expect(sql).toContain("is_active = excluded.is_active, review_status = excluded.review_status");
    expect(sql).toContain("is_active = excluded.is_active;");
    expect(questSection).not.toMatch(/, null, [^\n]+reflection/i);
    expect(seedMilestones).toHaveLength(38);
  });

  it("includes rolling-window, recent-verse, uniqueness, RLS, and purge migration", () => {
    const migration = readFileSync(
      path.join(
        process.cwd(),
        "supabase/migrations/0010_rolling_quest_windows_and_recent_verses.sql",
      ),
      "utf8",
    );
    expect(migration).toContain("picked_at");
    expect(migration).toContain("expires_at");
    expect(migration).toContain("create table if not exists public.user_recent_verses");
    expect(migration).toContain('create policy "own recent verses: all"');
    expect(migration).toContain("create trigger keep_newest_recent_verse");
    expect(migration).toContain("if new.viewed_at <= old.viewed_at then");
    expect(migration).toContain("return old;");
    expect(migration).toContain(
      "revoke execute on function public.keep_newest_recent_verse()",
    );
    expect(migration).toContain("daily_verses_passage_key");
    expect(migration).toContain("delete from public.user_recent_verses");
  });
});
