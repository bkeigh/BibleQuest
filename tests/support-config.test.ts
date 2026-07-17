import { describe, expect, it } from "vitest";
import { parseStripeDonationUrl } from "@/lib/support/config";

describe("Stripe support destination", () => {
  it("accepts only a clean HTTPS Stripe Payment Link", () => {
    expect(
      parseStripeDonationUrl("https://buy.stripe.com/test_publicfixture")?.toString()
    ).toBe("https://buy.stripe.com/test_publicfixture");
  });

  it.each([
    undefined,
    "",
    " https://buy.stripe.com/test_fixture",
    "http://buy.stripe.com/test_fixture",
    "https://checkout.stripe.com/test_fixture",
    "https://buy.stripe.com/",
    "https://buy.stripe.com/one/two",
    "https://buy.stripe.com/test-fixture",
    "https://buy.stripe.com/test_fixture?email=private@example.com",
    "https://buy.stripe.com/test_fixture#fragment",
    "https://buy.stripe.com.evil.test/test_fixture",
    "https://user:pass@buy.stripe.com/test_fixture",
  ])("rejects unsafe or malformed value %s", (value) => {
    expect(parseStripeDonationUrl(value)).toBeNull();
  });
});
