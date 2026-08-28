# iOS content-rights inventory — Version 1.2 account release

Status: **HOLD — inventory complete, visual-asset ownership evidence open**
Scope: the exact public media allowlist, native asset catalogs, generated fonts,
and online Scripture that can be reached by the next signed US-only replacement
build.
Last source review: **2026-08-27**

Do not accept App Store Connect's content-rights promise from this document
until every `OPEN` row is replaced by dated evidence and a named owner signs
the final-binary comparison. Repository inclusion and a Git author prove who
integrated a file; neither proves who created it or who owns its rights.

## Exact-binary boundary

`scripts/lib/native-media.mjs` is the executable public-picture allowlist.
`scripts/build-native.mjs` now removes every other public picture before the
native export and fails if the retained set drifts. The allowlist currently has
**79 files**: 64 manifest-controlled 2.5D files and 15 other native-route files.
The account build carries the supplied Apple mark solely for the functional
Sign in with Apple control. It excludes the unreachable Google mark, unused
game art, wallpaper thumbnails, and unused wallpaper posters.
`scripts/verify-ios-content-rights.mjs` verifies the generated native payload;
`scripts/verify-ios-release-app.mjs` repeats the byte comparisons inside the
extracted archived `.app` and includes the result in its exact tree digest.

The final signed-build comparison must also include these Xcode/build-produced
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
| A1 — 2.5D stills and candle loops | 64 | The external master README records BibleQuest art direction through the built-in image-generation path; the operator/account owner still requires a signed declaration. | External `Assets-BibleQuest/2.5D` generation reports date all 58 stills to **2026-08-01** and document six derived loops. All 64 source masters exactly match the runtime manifest paths and aggregate to the evidence fingerprint below. | `LICENSE` covers original BibleQuest assets jointly owned by Brendan Kenney and Winterhill Media LLC, but a signed record must still connect the operator, account, authorized pixel-sprite references, and masters to those owners. | Founder declaration must confirm the operator/account, authorized inputs, ownership at creation, and Winterhill Media LLC's App Store distribution rights. | Built-in image generation is documented, but the applicable account and terms cannot be inferred from files alone. | **OPEN — declaration required** |
| A2 — Scripture game art | 3 | Not required for the replacement build. | The candidate now reuses reviewed A3 posters for all three game cards and the Seven Days scene. The exact native allowlist excludes `scripture-games-today.webp`, `scripture-games-coming-2.webp`, and `seven-days-match-poster.webp`. | Not applicable to the replacement binary. | Not applicable to the replacement binary. | Not applicable to the replacement binary. | **OUT OF SCOPE — verifier must prove absent** |
| A3 — onboarding wallpaper posters | 6 | BibleQuest art direction using OpenAI image generation; the human/operator and generating account owner must be confirmed. | Exact source concepts remain under `output/live-wallpapers/**/openai-imagegen-20260720-r01/`; creation date **2026-07-20**. The shipped WebPs are derived stills and the source manifests are fingerprinted below. | Current OpenAI terms assign output to the customer/user to the extent permitted by law, but the repository does not prove which person/entity held the generating account or owned every input/reference. | Founder declaration must confirm the account, authorized inputs/references, and Winterhill Media LLC's distribution rights. | [OpenAI Terms of Use](https://openai.com/policies/row-terms-of-use/) and, if the generating account was business/API, the [Services Agreement](https://openai.com/policies/services-agreement/); both leave input rights and output review with the user/customer. | **OPEN — declaration required** |
| A4 — BibleQuest logo and Open Graph image | 2 | The `.ai` metadata identifies Adobe Illustrator 30.6 and `AIRobin`, but files cannot establish the human designer or account owner. | `BQ-Logo-Board-1.ai` was created **2026-07-09 01:58:35 -04:00**. `assets/BQ-Logo-Vector-Cross.svg`, `public/brand/bq-logo.svg`, and the Icon Composer logo source are byte-identical. `og.png` is a deterministic derivative. | Not evidenced beyond `LICENSE`. | Founder declaration must identify the designer/account, authorized inputs, ownership at creation, and Winterhill Media LLC's distribution rights. | Illustrator metadata is evidence of the tool, not ownership or input rights. | **OPEN — declaration required** |
| A5 — web/PWA icon derivatives | 6 | Deterministically produced from A4 and the active A6 layer. | Five PNGs are generated by `scripts/build-app-icons.mjs` from `2.5d-BQ-book.png`; `icon.svg` is generated by `scripts/build-icons.mjs` from the byte-identical A4 logo. | Inherits A4 and A6. | Inherits A4 and A6. | Sharp is only a deterministic processing tool. | **VERIFIED DERIVATION — inherits A4/A6** |
| A6 — App Icon Composer layers | 3 | The active book layer has an external PSD and 2.5D-generation evidence; the operator/account owner still requires a signed declaration. | `2.5d-BQ-book.png` exactly matches the external master; its PSD metadata records Photoshop 27.8, creation on **2026-08-01**, and modification on **2026-08-07**. Icon Composer marks `01-let-there-be-light.png` and `book-open.png` hidden; only the book layer renders. | Not evidenced beyond `LICENSE`. | Founder declaration must confirm the operator/account, authorized inputs, ownership at creation, and Winterhill Media LLC's distribution rights. | Icon Composer and Photoshop compose/edit the source; applicable generation-account terms still require confirmation. | **OPEN — declaration required** |
| A7 — launch images | 3 | Deterministic derivatives of `public/art/2.5d/book-open.webp`. | Generated by `scripts/build-ios-splash.mjs`; current files entered Git on 2026-08-13. | Inherits A1. | Inherits A1. | Sharp only resizes the unresolved A1 source. | **OPEN — hard stop** |
| A8 — app/favicon export | 1 source plus generated copies | Deterministically produced from A4. | `scripts/build-icons.mjs` generates `src/app/favicon.ico` from the byte-identical A4 logo source. | Inherits A4. | Inherits A4. | Sharp is only a deterministic processing tool. | **VERIFIED DERIVATION — inherits A4** |
| A9 — Sign in with Apple mark | 1 | Apple provider mark supplied for the existing sign-in control. | `public/brand/apple-logo-white.png`; introduced in repository history on **2026-07-28** and now reachable only from the functional Sign in with Apple button. | Apple Inc. owns the Apple mark. | Use is limited to identifying and initiating Sign in with Apple and must remain consistent with Apple's Sign in with Apple design requirements. | The mark is not BibleQuest artwork and must not be reused decoratively or outside the provider control. | **VERIFIED FUNCTIONAL USE — recheck exact signed button** |

### Required founder visual-rights declaration

Complete `docs/IOS_VISUAL_RIGHTS_DECLARATION.md` for A1, A3, A4, and A6. The
declarant must name the actual creator/operator and account holder, confirm that
every input/reference was owned or authorized, record ownership at creation and
any assignment or license, and grant or confirm Winterhill Media LLC's right to
distribute the material in the United States through the App Store. Legal/owner
review must then approve the exact signed replacement binary.

### Evidence fingerprints

These hashes make the reviewed source records reproducible; they do not replace
the required human ownership declaration.

| Evidence | SHA-256 |
| --- | --- |
| External 2.5D README | `ebcc555aa37a6706a354a4cb44f18649b376262bc21c98170077665411b56e67` |
| External 2.5D prompt specification | `69104b92e582524342c210071f4aad785473f337da0da1b6b98f3e55592e42d5` |
| External 2.5D sacred/nature/tree reports | `4d92b7ddd9c1e45e4a03124624f31f31e55ecf9d200f92816d7c03cf924b9f80` / `3175ac72e84d358640806729d5d499e4250620f4d02a3a8d38d87ec609f3481b` / `9e3e813cc72947af2022f19903bb1959b0c94ee37d4db105cca2daed3e934e68` |
| Aggregate of 64 external 2.5D source masters | `1e86842ca74f06b76a212d5cac0c4548ac8fd292f40406d650eb5fc24f9a9ed2` |
| Runtime 2.5D manifest | `16dd5fb46b209318d02bf30a74959a3c162205df9dbc2da769021bdb57ef59df` |
| Wallpaper v1 README / prompts / manifest | `762fea3b13a1575f0bdea8e2b863830c39749ef54f33de989024af0fe2744862` / `43e7455657e28fd112c6eda244732b3e29ba156c8e0d89f6fa2acac12595fa66` / `71cd661ffbe3b4e2e839c13fac70ac1e0d69e14e1bdd1fd987d3662942a5735b` |
| Biblical wallpaper README / manifest | `e12dba2e42eef55107364365166693f5f6d26f3240e5dc697fd0f840da959647` / `1a62f52671c6e7fd6976620cdec668c9c8f175832096df07692c6b2067df3a9b` |
| Byte-identical logo SVG source | `03e7a0164496686cd2a00e3c07462e737419bd49d26579c0f0e700db2598abd8` |
| Illustrator logo board | `45de8b9d5530a9cd4b773a144a051fe07ffca675da93c27416899c967f14d941` |
| Active App Icon book layer / external PSD | `2ed07b19bb61419dfcab95b6c8cd44e66d8c94e9289f7f2913819948ff7a4194` / `54b322cb8d7c368a51656b1cd3887b95510e9f2a9260156145df2b6aff130a26` |
| Sign in with Apple mark | `a0ddf4d6b890cfbb4892ae55f20615321c835c51c49f798925a2bc6e95021eb0` |

## Fonts and notices

| Content | Creator/source | License | Binary compliance | Status |
| --- | --- | --- | --- | --- |
| Fraunces | Fraunces Project Authors; loaded with `next/font/google` from Google Fonts | SIL Open Font License 1.1; [upstream license](https://github.com/google/fonts/blob/main/ofl/fraunces/OFL.txt) | Commercial embedding is permitted if the copyright notice and license accompany the font. Both are in `public/THIRD_PARTY_NOTICES.txt`, linked from Settings, and must be present in the final signed build. | **VERIFIED — recheck exact bundle** |
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

## Appendix B — exact A3–A5 public files

```text
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
| Every remaining `OPEN` field resolved | `[NAME]` | `[UTC]` | `[RESTRICTED EVIDENCE LINK]` |
| Legal accepts every asset and Scripture row for United States distribution | `[NAME]` | `[UTC]` | `[EVIDENCE]` |
| Signed replacement-build media/hashes exactly match this inventory | `[NAME]` | `[UTC]` | `[EVIDENCE]` |
| Production translation catalog is unchanged and API.Bible remains off | `[NAME]` | `[UTC]` | `[EVIDENCE]` |
| App Store content-rights promise approved | `[NAME]` | `[UTC]` | `[APP STORE EVIDENCE]` |

Until all five rows are complete, the App Store content-rights gate is
**NO-GO**.
