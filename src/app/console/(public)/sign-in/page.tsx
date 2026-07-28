import Image from "next/image";
import { redirect } from "next/navigation";
import { ConsoleSignIn } from "@/components/console/ConsoleSignIn";
import {
  getConsoleAccess,
  isConsoleAuthConfigured,
} from "@/lib/console/auth.server";
import { usesCleanConsoleUrls } from "@/lib/console/request.server";

export const dynamic = "force-dynamic";

/** Shows the operator gate while keeping configuration failures fail-closed. */
export default async function ConsoleSignInPage() {
  const [access, cleanUrls] = await Promise.all([
    getConsoleAccess(),
    usesCleanConsoleUrls(),
  ]);
  if (access.state === "authorized") {
    redirect(cleanUrls ? "/" : "/console");
  }

  const configured = isConsoleAuthConfigured();

  return (
    <main className="console-gate">
      <section className="console-gate-card">
        <div className="flex items-center gap-3">
          <Image
            src="/icons/icon-192.png"
            alt=""
            width={44}
            height={44}
            priority
            className="rounded-[11px]"
          />
          <div>
            <p className="font-display text-[1.2rem] leading-none text-graphite">
              BibleQuest
            </p>
            <p className="mt-1 font-pixel text-[0.63rem] tracking-[0.16em] text-evergreen-700">
              CONSOLE
            </p>
          </div>
        </div>

        <p className="console-eyebrow mt-10">PRIVATE OPERATIONS</p>
        <h1 className="mt-3 font-display text-[2.45rem] leading-[1.03] font-medium tracking-[-0.035em] text-graphite">
          Care for the app behind the app.
        </h1>
        <p className="mt-4 text-small leading-relaxed text-ash">
          Release health, content stewardship, account support, billing, and
          rollout posture in one protected place.
        </p>

        {configured ? (
          <ConsoleSignIn />
        ) : (
          <div className="mt-7 rounded-[12px] border border-gold-300 bg-gold-50 p-4">
            <p className="font-medium text-gold-700">Operator access is locked.</p>
            <p className="mt-1 text-caption leading-relaxed text-ash">
              Configure Supabase Auth and the server-only operator allowlist
              before signing in. Customer account sync stays independent.
            </p>
          </div>
        )}

        <div className="mt-8 border-t border-mist pt-5">
          <p className="text-caption leading-relaxed text-ash">
            Prayer and reflection bodies never appear here. Operator actions
            remain separate from product analytics.
          </p>
        </div>
      </section>
    </main>
  );
}
