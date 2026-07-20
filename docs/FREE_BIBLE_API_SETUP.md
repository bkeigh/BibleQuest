# Free Bible provider guide

BibleQuest is already connected to the best free option for the current app:
the keyless [HelloAO Free Use Bible API](https://bible.helloao.org/docs/).
No account, API key, environment variable, or founder-dashboard step is needed.

## Current provider path

1. **KJV is the default.** BibleQuest requests HelloAO edition `eng_kjv`
   through the stable in-app key `kjv`.
2. **Reviewed open editions stay allowlisted.** Each enabled HelloAO edition
   has a pinned provider id, metadata hash, canon totals, source, and license in
   `src/lib/bible/translations.ts`. A catalogue result alone cannot enable text.
3. **WEB is the offline safety net.** The complete public-domain World English
   Bible remains bundled, paints immediately, and is used if an online edition
   cannot load.
4. **Licensed editions stay dormant.** NIV, NLT, ESV, and NKJV are not offered
   until BibleQuest has a commercial license and the exact API.Bible ids are
   explicitly connected server-side.

The KJV source is public domain in the United States and most countries, while
UK Crown rights still apply. BibleQuest keeps the
[eBible KJV source and jurisdiction notice](https://ebible.org/Scriptures/details.php?id=eng-kjv2006)
visible with the edition metadata. BSB remains an unambiguous worldwide
public-domain open option.

## Verify the existing connection

Run the app with no Bible-related environment variables, choose KJV in
**Settings → Bible translation**, then open Genesis 1 and a daily verse. The
reader should label the live text KJV; temporarily going offline should show a
clearly labelled WEB fallback.

Automated provider checks:

```bash
pnpm vitest run tests/bible-translations.test.ts tests/helloao.test.ts
```

## Add another free HelloAO edition

Do not expose the full provider catalogue automatically. For one candidate:

1. Confirm the text's commercial-use terms from the underlying publisher or
   source—not only the API catalogue.
2. Confirm the intended canon is complete and inspect representative prose,
   poetry, headings, footnotes, and unusual chapters against the parser.
3. Add one static `BibleTranslation` entry to `HELLOAO_OPEN_TRANSLATIONS` with
   its exact provider id, current SHA-256, direction, source/license URL, and
   book/chapter/verse totals.
4. Mark it `featured` only if it belongs in the short primary picker.
5. Add tests for the exact endpoint, pinned metadata, parser behavior,
   attribution, bookmark persistence, sharing, and WEB fallback.

HelloAO uses the existing server-only adapter in `src/lib/bible/helloao.ts`, so
an allowlisted edition needs no secret and no new network client.

## Evaluate a different free provider

HelloAO should remain primary. If redundancy is needed, a reviewed vendored
snapshot is safer than adding another live dependency. Current alternatives:

| Provider | Credentials | KJV | Fit for BibleQuest |
| --- | --- | --- | --- |
| [HelloAO](https://bible.helloao.org/docs/) | None | `eng_kjv` | Primary; free and keyless. Commercial suitability depends on each underlying translation's rights; pin reviewed metadata. |
| [bible-api.com](https://bible-api.com/) | None | `kjv` | Possible emergency fallback; public service has a 15 requests / 30 seconds / IP limit and no uptime promise. |
| [GetBible v2](https://github.com/getbible/v2) | None | `kjv` | Consider only after reviewing GPL integration obligations and translation rights. |
| [API.Bible](https://scripture.api.bible/signup) | Key | Yes | Free Starter access is non-commercial, so it is not a free production option for monetized BibleQuest. Keep the adapter dormant until commercial access is affordable. |

If a new live provider is still justified, add a server-only adapter and route
it through `provider-dispatcher.ts`. Require a fixed HTTPS origin, bounded ids,
timeouts, response-size limits, schema validation, rate guards, explicit
edition allowlisting, source attribution, and failure back to WEB. Never put a
provider secret in a `NEXT_PUBLIC_*` variable or send provider responses
directly to storage.
