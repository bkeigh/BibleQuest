import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

type JournalBlock =
  | { kind: "paragraph" | "heading" | "quote"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "space" };

/**
 * Render the deliberately small formatting vocabulary supported by the
 * journal editor. Content is always emitted as React text nodes—never HTML—so
 * a prayer cannot smuggle markup or script into the page.
 */
function inlineText(value: string): ReactNode[] {
  const tokens = value.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g);
  return tokens.filter(Boolean).map((token, index) => {
    if (token.startsWith("**") && token.endsWith("**")) {
      return <strong key={index}>{token.slice(2, -2)}</strong>;
    }
    if (token.startsWith("*") && token.endsWith("*")) {
      return <em key={index}>{token.slice(1, -1)}</em>;
    }
    return <Fragment key={index}>{token}</Fragment>;
  });
}

function blocks(value: string): JournalBlock[] {
  const result: JournalBlock[] = [];
  const lines = value.replace(/\r\n?/g, "\n").split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) {
      result.push({ kind: "space" });
      continue;
    }
    if (line.startsWith("- ")) {
      const items: string[] = [];
      while (index < lines.length && lines[index].startsWith("- ")) {
        items.push(lines[index].slice(2));
        index += 1;
      }
      index -= 1;
      result.push({ kind: "list", items });
      continue;
    }
    if (line.startsWith("> ")) {
      result.push({ kind: "quote", text: line.slice(2) });
      continue;
    }
    if (line.startsWith("## ")) {
      result.push({ kind: "heading", text: line.slice(3) });
      continue;
    }
    result.push({ kind: "paragraph", text: line });
  }

  return result;
}

export function JournalEntryBody({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {blocks(children).map((block, index) => {
        if (block.kind === "space") {
          return <div key={index} className="h-1" aria-hidden="true" />;
        }
        if (block.kind === "list") {
          return (
            <ul key={index} className="ml-5 list-disc space-y-1 marker:text-accent">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{inlineText(item)}</li>
              ))}
            </ul>
          );
        }
        if (block.kind === "quote") {
          return (
            <blockquote
              key={index}
              className="border-l-2 border-gold-500/55 pl-3 italic text-ash"
            >
              {inlineText(block.text)}
            </blockquote>
          );
        }
        if (block.kind === "heading") {
          return (
            <h4 key={index} className="font-display text-[1.0625rem] text-graphite">
              {inlineText(block.text)}
            </h4>
          );
        }
        return <p key={index}>{inlineText(block.text)}</p>;
      })}
    </div>
  );
}
