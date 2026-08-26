# iOS content-rights inventory — Version 1.2 account release

Status: **HOLD — inventory complete, visual-asset ownership evidence open**
Scope: the exact public media allowlist, native asset catalogs, generated fonts,
and online Scripture that can be reached by the planned US-only Build 41.
Last source review: **2026-08-26**

Do not accept App Store Connect's content-rights promise from this document
until every `OPEN` row is replaced by dated evidence and a named owner signs
the final-binary comparison. Repository inclusion and a Git author prove who
integrated a file; neither proves who created it or who owns its rights.

## Exact-binary boundary

`scripts/lib/native-media.mjs` is the executable public-picture allowlist.
`scripts/build-native.mjs` now removes every other public picture before the
native export and fails if the retained set drifts. The allowlist currently has
**81 files**: 64 manifest-controlled 2.5D files and 17 other native-route files.
The account build no longer carries the dormant Apple/Google web sign-in marks,
unused game art, wallpaper thumbnails, or unused wallpaper posters.

The final Build 41 comparison must also include these Xcode/build-produced
surfaces, which are not under `public/`:

- the three App Icon Composer layers in `ios/App/App/AppIcon.icon/Assets/`;
- the three launch images in
  `ios/App/App/Assets.xcassets/Splash.imageset/`;
- `src/app/favicon.ico` and its generated export;
- every generated `/_next/static/media/*.woff2` font file; and
- `public/THIRD_PARTY_NOTICES.txt`, which must remain in the signed bundle and
  reachable from Settings → About → Third-party notices.

## Visual-asset evidence rows

Every filename in the appendices inherits the fields and status of its row.
No group may be approved by sampling only one file.

| Row | Files | Creator | Source and creation date | Rights owner | License or assignment | Image/tool terms | Status |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| A1 — 2.5D stills and candle loops | 64 | Not evidenced per file. Brendan Kenney is the 2026-08-03 Git integrator, not thereby the creator. | External `Assets-BibleQuest/2.5D` master library; runtime promotion is documented by `docs/ART_SYSTEM.md` and `public/art/2.5d/manifest.json`. Master creation dates are not evidenced in the repository. | `LICENSE` covers original BibleQuest assets jointly owned by Brendan Kenney and Winterhill Media LLC, but no record ties each master to that ownership statement. | No per-file assignment, employee-work record, or signed creator declaration is present. | The generator/editor and the terms in force on each creation date are not recorded. | **OPEN — hard stop** |
| A2 — Scripture game art | 3 | Not evidenced per file. | `scripture-games-today.webp` and `scripture-games-coming-2.webp` entered Git on 2026-07-30; `seven-days-match-poster.webp` entered on 2026-08-03. Source masters and actual creation dates are not recorded. | Not evidenced beyond the conditional original-assets statement in `LICENSE`. | No per-file assignment or creator declaration is present. | The generator/editor and applicable terms are not recorded. | **OPEN — hard stop** |
| A3 — onboarding wallpaper posters | 6 | BibleQuest art direction using OpenAI image generation; the human/operator and generating account owner must be confirmed. | Exact source concepts remain under `output/live-wallpapers/**/openai-imagegen-20260720-r01/`; creation date **2026-07-20**. The shipped WebPs are derived stills. | Current OpenAI terms assign output to the customer/user to the extent permitted by law, but the repository does not prove which person/entity held the generating account or owned every input/reference. | Founder declaration must confirm the account, authorized inputs/references, and transfer to the App Store seller. | [OpenAI Terms of Use](https://openai.com/policies/row-terms-of-use/) and, if the generating account was business/API, the [Services Agreement](https://openai.com/policies/services-agreement/); both leave input rights and output review with the user/customer. | **OPEN — hard stop** |
| A4 — BibleQuest logo and Open Graph image | 2 | Not evidenced per file. | `bq-logo.svg` entered Git on 2026-07-09; `og.png` entered on 2026-07-07. Source/design records are absent. | Not evidenced beyond `LICENSE`. | No per-file assignment or creator declaration is present. | The design/generation tools and applicable commercial terms are not recorded. | **OPEN — hard stop** |
| A5 — web/PWA icon derivatives | 6 | Deterministically composed by `scripts/build-app-icons.mjs` from App Icon layer `2.5d-BQ-book.png`; the layer creator is not evidenced. | Derived from the App Icon Composer source. Five PNGs are generated; `icon.svg` has separate source provenance that is not recorded. | Inherits the unresolved App Icon layer ownership; `icon.svg` is separately unresolved. | No per-source assignment or creator declaration is present. | Sharp and Xcode are processing tools, not a source of rights; any earlier image-generation terms remain unrecorded. | **OPEN — hard stop** |
| A6 — App Icon Composer layers | 3 | Not evidenced per layer. | Added to Git on 2026-08-07. `01-let-there-be-light.png` derives from the wallpaper family; `2.5d-BQ-book.png` and `book-open.png` have no checked-in master/provenance record tying them to A1. | Not evidenced beyond `LICENSE`. | No per-layer assignment or creator declaration is present. | Xcode Icon Composer only composes the layers; original-generation/editing terms are not recorded. | **OPEN — hard stop** |
| A7 — launch images | 3 | Deterministic derivatives of `public/art/2.5d/book-open.webp`. | Generated by `scripts/build-ios-splash.mjs`; current files entered Git on 2026-08-13. | Inherits A1. | Inherits A1. | Sharp only resizes the unresolved A1 source. | **OPEN — hard stop** |
| A8 — app/favicon export | 1 source plus generated copies | Not evidenced. | `src/app/favicon.ico` entered Git on 2026-07-07; source/design record absent. | Not evidenced beyond `LICENSE`. | No per-file assignment or creator declaration is present. | The design/generation tool and applicable terms are not recorded. | **OPEN — hard stop** |

### Required founder visual-rights declaration

For A1, A2, A4, A5, A6, and A8, attach a dated declaration naming the actual
creator/operator, source/master location, creation date or bounded date range,
owner at creation, any transfer/assignment, every input/reference that carried
third-party rights, and the tool/account terms that permitted commercial app
distribution. For A3, add the generating OpenAI account owner and confirm that
all prompts and reference images were authorized. Legal/owner review must then
approve the US-only use of every row.

## Fonts and notices

| Content | Creator/source | License | Binary compliance | Status |
| --- | --- | --- | --- | --- |
| Fraunces | Fraunces Project Authors; loaded with `next/font/google` from Google Fonts | SIL Open Font License 1.1; [upstream license](https://github.com/google/fonts/blob/main/ofl/fraunces/OFL.txt) | Commercial embedding is permitted if the copyright notice and license accompany the font. Both are in `public/THIRD_PARTY_NOTICES.txt`, linked from Settings, and must be present in Build 41. | **VERIFIED — recheck exact bundle** |
| Inter | Inter Project Authors; loaded with `next/font/google` from Google Fonts | SIL Open Font License 1.1; [upstream license](https://github.com/google/fonts/blob/main/ofl/inter/OFL.txt) | Same as Fraunces. | **VERIFIED — recheck exact bundle** |

At final freeze, record every hashed WOFF2 filename and SHA-256 from the signed
`.app`. A generated subset remains covered by its parent font's OFL row; it is
not a new visual-rights row.

## Scripture and provider rights

Production was read without credentials on 2026-08-26. It reported HelloAO
configured, API.Bible unconfigured, the six reviewed HelloAO editions below,
and bundled WEB. NIV, NLT, ESV, and NKJV appeared only as disabled
`provider_required` metadata; no licensed text connection was active.

| Edition/content | Delivery | Primary rights evidence | US launch status |
| --- | --- | --- | --- |
| World English Bible (WEB) | Bundled offline | [World English Bible public-domain notice](https://worldenglish.bible/) permits electronic copying and distribution of a faithful text; the name remains a trademark used to identify that text. | **VERIFIED** |
| Berean Standard Bible (BSB) | HelloAO, pinned provider hash | [Berean licensing](https://berean.bible/licensing.htm) dedicates the text to the public domain and permits all uses. | **VERIFIED** |
| King James Version (KJV) | HelloAO/eBible, pinned provider hash | [eBible KJV record](https://ebible.org/Scriptures/details.php?id=eng-kjv2006) says public domain outside the UK and records UK Crown rights. | **VERIFIED — United States only** |
| Reina Valera 1909 (R09) | HelloAO/eBible, pinned provider hash | [eBible R09 record](https://ebible.org/Scriptures/details.php?id=spaRV1909) says public domain. | **VERIFIED — US launch** |
| Lutherbibel 1912 (L12) | HelloAO/eBible, pinned provider hash | [eBible L12 record](https://ebible.org/Scriptures/details.php?id=deu1912) says public domain. | **VERIFIED — US launch** |
| Chinese Union Version, simplified (CU1) | HelloAO/eBible, pinned provider hash | [eBible CU1 record](https://ebible.org/Scriptures/details.php?id=cmn-cu89s) says public domain. This does not authorize distribution in mainland China; China is excluded from launch. | **VERIFIED — US launch only** |
| Arabic Van Dyck (VDV) | HelloAO/eBible, pinned provider hash | [eBible VDV record](https://ebible.org/find/details.php?id=arb-vd) says public domain. | **VERIFIED — US launch** |
| HelloAO API/software | HTTPS JSON delivery only | [HelloAO licensing](https://bible.helloao.org/docs/guide/a-biblical-model-for-licensing-the-bible.html) makes the API/source available under MIT and separately identifies underlying text rights. | **VERIFIED — retain attribution/source links** |
| NIV, NLT, ESV, NKJV | Disabled names only; API.Bible unconfigured on 2026-08-26 | No text may be returned until an exact edition ID is commercially licensed and placed in the server allowlist. | **OUT OF SCOPE — text must remain unavailable** |

At final freeze, save a sanitized copy/hash of
`https://www.biblequest.co/api/bible/translations`, confirm API.Bible remains
unconfigured, and confirm each HelloAO provider hash still equals
`src/lib/bible/translations.ts`. Any new usable edition is an immediate rights
hold.

## Appendix A — exact A1 files

```text
public/art/2.5d/bird.webp
public/art/2.5d/book-open.webp
public/art/2.5d/book.webp
public/art/2.5d/bookmark.webp
public/art/2.5d/candle-halo.webp
public/art/2.5d/candle-small.webp
public/art/2.5d/candle-sparks.webp
public/art/2.5d/candle-steady.webp
public/art/2.5d/candle-unlit.webp
public/art/2.5d/candle.webp
public/art/2.5d/candles/candle-halo.gif
public/art/2.5d/candles/candle-small.gif
public/art/2.5d/candles/candle-sparks.gif
public/art/2.5d/candles/candle-steady.gif
public/art/2.5d/candles/candle-unlit.gif
public/art/2.5d/candles/candle.gif
public/art/2.5d/chapel.webp
public/art/2.5d/compass.webp
public/art/2.5d/cross.webp
public/art/2.5d/crown.webp
public/art/2.5d/door.webp
public/art/2.5d/dove.webp
public/art/2.5d/flower.webp
public/art/2.5d/fountain.webp
public/art/2.5d/hands-praying.webp
public/art/2.5d/key.webp
public/art/2.5d/lantern.webp
public/art/2.5d/leaf.webp
public/art/2.5d/links.webp
public/art/2.5d/map.webp
public/art/2.5d/mascot-campfire.webp
public/art/2.5d/mascot-lamb.webp
public/art/2.5d/moon.webp
public/art/2.5d/mountain.webp
public/art/2.5d/myshepherd.webp
public/art/2.5d/people.webp
public/art/2.5d/scroll.webp
public/art/2.5d/service-basket.webp
public/art/2.5d/sprout.webp
public/art/2.5d/star.webp
public/art/2.5d/stone.webp
public/art/2.5d/sun.webp
public/art/2.5d/tree-stage-0.webp
public/art/2.5d/tree-stage-1.webp
public/art/2.5d/tree-stage-10.webp
public/art/2.5d/tree-stage-11.webp
public/art/2.5d/tree-stage-12.webp
public/art/2.5d/tree-stage-13.webp
public/art/2.5d/tree-stage-14.webp
public/art/2.5d/tree-stage-15.webp
public/art/2.5d/tree-stage-16.webp
public/art/2.5d/tree-stage-17.webp
public/art/2.5d/tree-stage-18.webp
public/art/2.5d/tree-stage-19.webp
public/art/2.5d/tree-stage-2.webp
public/art/2.5d/tree-stage-3.webp
public/art/2.5d/tree-stage-4.webp
public/art/2.5d/tree-stage-5.webp
public/art/2.5d/tree-stage-6.webp
public/art/2.5d/tree-stage-7.webp
public/art/2.5d/tree-stage-8.webp
public/art/2.5d/tree-stage-9.webp
public/art/2.5d/tree.webp
public/art/2.5d/wheat.webp
```

## Appendix B — exact A2–A5 public files

```text
public/art/scripture-games-coming-2.webp
public/art/scripture-games-today.webp
public/art/seven-days-match-poster.webp
public/brand/bq-logo.svg
public/icons/apple-touch-icon.png
public/icons/favicon-48.png
public/icons/icon-192.png
public/icons/icon-512.png
public/icons/icon-maskable-512.png
public/icons/icon.svg
public/og.png
public/wallpapers/01-let-there-be-light/poster.webp
public/wallpapers/12-baptism-in-the-jordan/poster.webp
public/wallpapers/20-empty-tomb-at-dawn/poster.webp
public/wallpapers/galilee-be-still/poster.webp
public/wallpapers/the-olive-grove/poster.webp
public/wallpapers/the-sheltering-tree/poster.webp
```

The six wallpaper sources, in the same order, are the matching files under:

```text
output/live-wallpapers/biblical-moments-v1/concepts/{01-let-there-be-light,12-baptism-in-the-jordan,20-empty-tomb-at-dawn}/generations/still/openai-imagegen-20260720-r01/
output/live-wallpapers/v1/concepts/{galilee-be-still,the-olive-grove,the-sheltering-tree}/generations/still/openai-imagegen-20260720-r01/
```

## Appendix C — exact A6–A8 native sources

```text
ios/App/App/AppIcon.icon/Assets/01-let-there-be-light.png
ios/App/App/AppIcon.icon/Assets/2.5d-BQ-book.png
ios/App/App/AppIcon.icon/Assets/book-open.png
ios/App/App/Assets.xcassets/Splash.imageset/book-open-256.png
ios/App/App/Assets.xcassets/Splash.imageset/book-open-512.png
ios/App/App/Assets.xcassets/Splash.imageset/book-open-768.png
src/app/favicon.ico
```

## Final sign-off

| Check | Named owner | UTC | Result/evidence |
| --- | --- | --- | --- |
| Every A1–A8 `OPEN` field resolved | `[NAME]` | `[UTC]` | `[RESTRICTED EVIDENCE LINK]` |
| Legal accepts every asset and Scripture row for United States distribution | `[NAME]` | `[UTC]` | `[EVIDENCE]` |
| Signed Build 41 media/hashes exactly match this inventory | `[NAME]` | `[UTC]` | `[EVIDENCE]` |
| Production translation catalog is unchanged and API.Bible remains off | `[NAME]` | `[UTC]` | `[EVIDENCE]` |
| App Store content-rights promise approved | `[NAME]` | `[UTC]` | `[APP STORE EVIDENCE]` |

Until all five rows are complete, the App Store content-rights gate is
**NO-GO**.
