import Link from "next/link";
import {
  ConsolePageHeader,
  ConsolePanel,
  ConsoleStatus,
} from "@/components/console/ConsolePrimitives";
import { seedQuests } from "@/data/seed/quests";
import { QUEST_CATEGORIES, type QuestCategory } from "@/lib/questos/types";
import { consoleHref } from "@/lib/console/paths";
import { usesCleanConsoleUrls } from "@/lib/console/request.server";

interface ContentPageProps {
  searchParams: Promise<{ q?: string; category?: string }>;
}

/** Browses the reviewed quest catalogue without introducing a second source of truth. */
export default async function ConsoleContentPage({
  searchParams,
}: ContentPageProps) {
  const [params, cleanUrls] = await Promise.all([
    searchParams,
    usesCleanConsoleUrls(),
  ]);
  const query = params.q?.trim().toLowerCase().slice(0, 80) ?? "";
  const category = QUEST_CATEGORIES.includes(params.category as QuestCategory)
    ? (params.category as QuestCategory)
    : null;
  const filtered = seedQuests.filter((quest) => {
    if (category && quest.category !== category) return false;
    if (!query) return true;
    return [quest.title, quest.slug, quest.category, ...quest.tags]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });

  return (
    <>
      <ConsolePageHeader
        eyebrow="CONTENT STUDIO"
        title="Steward every invitation."
        description="Search the canonical reviewed catalogue, inspect safety markers, and preview exactly what BibleQuest ships."
        actions={
          <ConsoleStatus tone="good">{seedQuests.length} approved</ConsoleStatus>
        }
      />

      <form className="console-filter-bar" role="search">
        <label className="sr-only" htmlFor="content-search">
          Search quest content
        </label>
        <input
          id="content-search"
          name="q"
          type="search"
          defaultValue={params.q ?? ""}
          placeholder="Search title, slug, category, or tag"
          className="console-filter-input"
        />
        <label className="sr-only" htmlFor="content-category">
          Filter by category
        </label>
        <select
          id="content-category"
          name="category"
          defaultValue={category ?? ""}
          className="console-filter-select"
        >
          <option value="">All categories</option>
          {QUEST_CATEGORIES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <button className="console-filter-button" type="submit">
          Filter
        </button>
      </form>

      <ConsolePanel
        title={`${filtered.length} ${filtered.length === 1 ? "quest" : "quests"}`}
        description="Approved seed content is read-only in this first console release."
      >
        <div className="console-table-wrap">
          <table className="console-table">
            <thead>
              <tr>
                <th>Quest</th>
                <th>Category</th>
                <th>Duration</th>
                <th>Review</th>
                <th>Safety</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((quest) => (
                <tr key={quest.slug}>
                  <td>
                    <Link
                      href={consoleHref(`/content/${quest.slug}`, cleanUrls)}
                      className="console-table-link"
                    >
                      {quest.title}
                    </Link>
                    <p className="mt-1 font-mono text-[0.7rem] text-fog">
                      {quest.slug}
                    </p>
                  </td>
                  <td className="capitalize">{quest.category}</td>
                  <td>{quest.durationMinutes} min</td>
                  <td>
                    <ConsoleStatus tone="good">approved</ConsoleStatus>
                  </td>
                  <td>
                    <ConsoleStatus
                      tone={
                        quest.sensitivityTags.length > 0 ? "warning" : "neutral"
                      }
                    >
                      {quest.sensitivityTags.length > 0
                        ? `${quest.sensitivityTags.length} tagged`
                        : "standard"}
                    </ConsoleStatus>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ConsolePanel>
    </>
  );
}
