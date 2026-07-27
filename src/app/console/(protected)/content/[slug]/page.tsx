import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ConsolePageHeader,
  ConsolePanel,
  ConsoleStatus,
} from "@/components/console/ConsolePrimitives";
import { questBySlug } from "@/data/seed/quests";
import { consoleHref } from "@/lib/console/paths";
import { usesCleanConsoleUrls } from "@/lib/console/request.server";

interface ContentDetailProps {
  params: Promise<{ slug: string }>;
}

/** Previews one reviewed quest and its safety boundary as shipped. */
export default async function ConsoleContentDetailPage({
  params,
}: ContentDetailProps) {
  const [{ slug }, cleanUrls] = await Promise.all([
    params,
    usesCleanConsoleUrls(),
  ]);
  const quest = questBySlug.get(slug);
  if (!quest) notFound();

  return (
    <>
      <Link
        href={consoleHref("/content", cleanUrls)}
        className="console-back-link"
      >
        ← All content
      </Link>

      <ConsolePageHeader
        eyebrow={`${quest.category.toUpperCase()} · ${quest.durationMinutes} MINUTES`}
        title={quest.title}
        description={quest.invitation}
        actions={<ConsoleStatus tone="good">Approved</ConsoleStatus>}
      />

      <div className="console-two-column console-content-preview-grid">
        <ConsolePanel title="Quest preview" description="Exact reviewed copy.">
          <div className="console-editorial-preview">
            <p className="console-preview-label">WHY IT MATTERS</p>
            <p>{quest.whyItMatters}</p>

            <p className="console-preview-label">SCRIPTURE</p>
            <p className="font-medium text-graphite">
              {quest.scriptureReference}
            </p>
            {quest.scriptureText ? (
              <blockquote className="console-scripture">
                {quest.scriptureText}
              </blockquote>
            ) : null}

            <p className="console-preview-label">REFLECTION</p>
            <p>{quest.reflectionPrompt}</p>

            <p className="console-preview-label">PRAYER</p>
            <p>{quest.prayerPrompt}</p>
          </div>
        </ConsolePanel>

        <div className="space-y-5">
          <ConsolePanel title="Review boundary">
            <dl className="console-definition-list">
              <div>
                <dt>Difficulty</dt>
                <dd className="capitalize">{quest.difficulty}</dd>
              </div>
              <div>
                <dt>Energy</dt>
                <dd className="capitalize">{quest.energyLevel}</dd>
              </div>
              <div>
                <dt>Setting</dt>
                <dd className="capitalize">{quest.indoorOrOutdoor}</dd>
              </div>
              <div>
                <dt>Participation</dt>
                <dd className="capitalize">{quest.soloOrSocial}</dd>
              </div>
              <div>
                <dt>Growth</dt>
                <dd className="capitalize">{quest.growthType}</dd>
              </div>
              <div>
                <dt>Premium</dt>
                <dd>{quest.isPremium ? "Yes" : "No"}</dd>
              </div>
            </dl>
          </ConsolePanel>

          <ConsolePanel title="Safety & taxonomy">
            <div className="console-tag-list">
              {quest.tags.map((tag) => (
                <span key={tag} className="console-tag">
                  {tag}
                </span>
              ))}
            </div>
            <div className="mt-5 border-t border-mist pt-4">
              <p className="console-preview-label">SENSITIVITY</p>
              {quest.sensitivityTags.length > 0 ? (
                <div className="console-tag-list mt-2">
                  {quest.sensitivityTags.map((tag) => (
                    <span key={tag} className="console-tag-warning">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : (
                <ConsoleStatus tone="neutral">
                  No sensitive-category tag
                </ConsoleStatus>
              )}
            </div>
          </ConsolePanel>
        </div>
      </div>
    </>
  );
}
