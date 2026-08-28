import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

/** Reads one versioned Supabase Auth template from the repository. */
function template(name: "confirmation" | "magic-link"): string {
  return readFileSync(
    join(ROOT, "supabase", "templates", `${name}.html`),
    "utf8",
  );
}

describe("PWA-safe auth email templates", () => {
  it.each(["confirmation", "magic-link"] as const)(
    "%s keeps email authentication bound to the requesting app with a code",
    (name) => {
      const html = template(name);

      expect(html).toContain("{{ .Token }}");
      expect(html).not.toContain("{{ .TokenHash }}");
      expect(html).not.toContain("{{ .RedirectTo }}");
      expect(html).not.toContain("{{ .ConfirmationURL }}");
      expect(html.match(/https?:\/\/[^"\s]+/g)).toEqual([
        "https://www.biblequest.co/icons/icon-192.png",
      ]);
    },
  );

  it("wires both templates into local Supabase configuration", () => {
    const config = readFileSync(join(ROOT, "supabase", "config.toml"), "utf8");
    // Isolate email Auth so the disabled SMS OTP setting cannot satisfy this gate.
    const emailConfig = config.match(
      /\[auth\.email\]([\s\S]*?)(?=\n\[auth\.(?:email\.|sms\]))/,
    )?.[1];

    expect(emailConfig).toMatch(/^otp_length\s*=\s*6$/m);
    expect(config).toContain("[auth.email.template.confirmation]");
    expect(config).toContain("[auth.email.template.magic_link]");
    expect(config).toContain("./supabase/templates/confirmation.html");
    expect(config).toContain("./supabase/templates/magic-link.html");
    expect(config).not.toMatch(/^subject\s*=\s*".*\{\{\s*\.Token\s*\}\}/m);
  });
});
