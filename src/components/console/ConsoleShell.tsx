import Image from "next/image";
import { ConsoleNav } from "@/components/console/ConsoleNav";
import { consoleHref } from "@/lib/console/paths";

interface ConsoleShellProps {
  email: string;
  cleanUrls: boolean;
  signOutAction: () => Promise<void>;
  children: React.ReactNode;
}

/** Frames every protected operator screen with persistent identity and navigation. */
export function ConsoleShell({
  email,
  cleanUrls,
  signOutAction,
  children,
}: ConsoleShellProps) {
  return (
    <div className="console-shell">
      <aside className="console-sidebar">
        <div className="console-brand">
          <Image
            src="/icons/icon-192.png"
            alt=""
            width={38}
            height={38}
            priority
            className="console-brand-mark"
          />
          <div>
            <p className="font-display text-[1.18rem] leading-none text-[#fffdf7]">
              BibleQuest
            </p>
            <p className="mt-1 font-art-label text-[0.62rem] tracking-[0.16em] text-gold-300">
              CONSOLE
            </p>
          </div>
        </div>

        <ConsoleNav cleanUrls={cleanUrls} />

        <div className="console-operator">
          <p className="font-art-label text-[0.62rem] tracking-[0.13em] text-evergreen-300">
            OPERATOR
          </p>
          <p className="mt-1 truncate text-caption text-evergreen-50">{email}</p>
          <form action={signOutAction} className="mt-3">
            <button className="console-signout" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="console-mobile-header">
        <div className="flex min-w-0 items-center gap-2.5">
          <Image
            src="/icons/icon-192.png"
            alt=""
            width={32}
            height={32}
            className="rounded-[8px]"
          />
          <div className="min-w-0">
            <p className="truncate font-display text-[1.05rem] text-[#fffdf7]">
              BibleQuest Console
            </p>
            <p className="truncate text-[0.68rem] text-evergreen-100">{email}</p>
          </div>
        </div>
        <form action={signOutAction}>
          <button className="console-signout" type="submit">
            Sign out
          </button>
        </form>
      </div>

      <div className="console-mobile-nav">
        <ConsoleNav cleanUrls={cleanUrls} />
      </div>

      <main className="console-main">{children}</main>

      <a
        href={consoleHref("/", cleanUrls)}
        aria-label="Back to console home"
        className="sr-only focus:not-sr-only"
      >
        Console home
      </a>
    </div>
  );
}
