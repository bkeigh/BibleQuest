import { describe, expect, it } from "vitest";
import {
  myShepherdActionHref,
  myShepherdReferenceHref,
} from "@/lib/ai/myshepherd-navigation";

describe("MyShepherd navigation", () => {
  it("maps only structured app destinations", () => {
    expect(
      myShepherdActionHref({
        destination: "reflections",
        label: "Write a reflection",
      }),
    ).toBe("/app/prayer/reflections");
  });

  it("opens canonical chapter and verse references locally", () => {
    expect(myShepherdReferenceHref("John 3:16")).toBe(
      "/app/bible/john/3?verse=16#verse-16",
    );
    expect(myShepherdReferenceHref("Romans 8:28-30")).toBe(
      "/app/bible/romans/8?verse=28-30#verse-28",
    );
    expect(myShepherdReferenceHref("Psalm 23")).toBe(
      "/app/bible/psalms/23",
    );
  });

  it("rejects malformed and out-of-range references", () => {
    expect(myShepherdReferenceHref("https://example.com")).toBeNull();
    expect(myShepherdReferenceHref("John 99:1")).toBeNull();
    expect(myShepherdReferenceHref("John 3:999")).toBeNull();
  });
});
