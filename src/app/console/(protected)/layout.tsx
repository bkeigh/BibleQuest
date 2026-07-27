import { redirect } from "next/navigation";
import { ConsoleShell } from "@/components/console/ConsoleShell";
import { getConsoleAccess } from "@/lib/console/auth.server";
import { usesCleanConsoleUrls } from "@/lib/console/request.server";
import { signOutConsole } from "./actions";

export const dynamic = "force-dynamic";

/** Enforces server-side operator authorization for every protected screen. */
export default async function ProtectedConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [access, cleanUrls] = await Promise.all([
    getConsoleAccess(),
    usesCleanConsoleUrls(),
  ]);

  if (access.state === "unauthenticated") {
    redirect(cleanUrls ? "/sign-in" : "/console/sign-in");
  }

  if (access.state === "configuration_required") {
    redirect(
      cleanUrls ? "/sign-in?setup=required" : "/console/sign-in?setup=required",
    );
  }

  if (access.state === "forbidden") {
    return (
      <main className="console-gate">
        <section className="console-gate-card">
          <p className="console-eyebrow">ACCESS NOT GRANTED</p>
          <h1 className="mt-3 font-display text-[2.25rem] leading-tight text-graphite">
            This account is not an operator.
          </h1>
          <p className="mt-4 text-small leading-relaxed text-ash">
            BibleQuest Console uses a separate server-side allowlist. No app
            data was loaded.
          </p>
          <form action={signOutConsole} className="mt-7">
            <button className="console-primary-button" type="submit">
              Sign out
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <ConsoleShell
      email={access.email}
      cleanUrls={cleanUrls}
      signOutAction={signOutConsole}
    >
      {children}
    </ConsoleShell>
  );
}
