# iOS 26 Liquid Glass — bottom tab bar adoption plan

> **STATUS (2026-08-14):** Parked research plan. No code depends on it; revisit only if the tab-bar adoption is rescheduled.


**Status:** research and planning only. No app code changed by this document.
**Written:** 2026-08-07, against `feat/capacitor-ios-scaffold`.
**Intended home:** a separate branch, after the 10-day polish deadline lands.

The question this answers: BibleQuest's tab bar is a DOM `<nav>` inside a
WKWebView, not a `UITabBar`. iOS 26's Liquid Glass is a native material. What
part of it can we actually have, what would it cost, and what breaks.

---

## Recommendation up front

**Ship Stage 1 (CSS refinement of the existing DOM bar) on the polish branch.
Prototype Stage 3 (a real `UITabBar`) on a throwaway branch and decide on
evidence. Do not adopt a third-party plugin.**

Reasoning in one paragraph: `app-glass-nav` already implements the translucent
fill, backdrop blur, saturation boost, rim highlight and ambient shadow that
make up the *static* read of Liquid Glass. What it is missing is mostly
**shape and behaviour** — the floating inset pill, the minimize-on-scroll — and
those are pure CSS/JS, cheap, and keep the one-component-set rule intact. What
CSS genuinely cannot reach is **refraction and motion-reactive specular
highlight**, and those are the two things nobody notices on a warm parchment
palette. Going native buys a materially better tab bar and a stronger
Guideline 4.2 story, but it breaks the single-component-set rule, decouples
four DOM consumers of `--app-bottom-nav-height`, and moves VoiceOver's primary
navigation out of the accessibility tree the rest of the app lives in. That is
a real project, not a polish item.

---

## 1. What Liquid Glass actually is in iOS 26

Liquid Glass is a material, not a colour. It replaces the flat translucent bar
backgrounds of iOS 7–18 with a layer that behaves optically like a lens: it
blurs and saturates what is behind it, **bends** light at its edges, carries a
specular highlight that tracks device motion, and adapts its own foreground
contrast to the luminance of whatever is passing underneath.

For a bottom tab bar specifically, iOS 26 changes four things:

1. **The bar floats.** It is no longer welded to the bottom edge. It is an
   inset, fully rounded capsule with content visibly running underneath it.
2. **It minimizes on scroll.** `UITabBarController.tabBarMinimizeBehavior =
   .onScrollDown` (SwiftUI: `.tabBarMinimizeBehavior(.onScrollDown)`) collapses
   the bar to the active tab alone on scroll-down and re-expands on scroll-up.
3. **It has an accessory shelf.** `UITabBarController.accessoryView` (SwiftUI:
   `tabViewBottomAccessory`) puts a persistent strip above the tabs — the Music
   mini-player — that animates down and inline when the bar minimizes.
4. **There is a search tab role.** `Tab(role: .search)` pins a dedicated
   search affordance bottom-right.

### Native-only vs. approximable

| Property | Native (UIKit/SwiftUI) | Reachable from CSS in WKWebView |
|---|---|---|
| Translucent fill over content | yes | **yes** — `background-color` with alpha |
| Backdrop blur | yes | **yes** — `backdrop-filter: blur()` |
| Saturation boost of the backdrop | yes | **yes** — `saturate()` in the same filter |
| Rim / edge highlight | yes | **yes** — `inset` `box-shadow` |
| Ambient drop shadow | yes | **yes** — `box-shadow` |
| Floating inset capsule shape | yes | **yes** — inset positioning + `border-radius` |
| Minimize on scroll | yes, one property | **yes, but hand-built** — scroll listener + transform |
| Accessory shelf | yes | **yes** — it is just a sibling element |
| **Refraction / edge lensing** | yes | **no** — see below |
| **Motion-reactive specular highlight** | yes | **no** — no gyroscope hook, no API |
| **Backdrop-luminance-adaptive contrast** | yes | **no** — CSS cannot query backdrop luminance |
| **Fluid morph geometry between states** | yes | **no** — not at that fidelity |
| System-wide consistency with Control Center, keyboard, share sheet | yes, free | no |

**On refraction specifically.** The bending/magnifying edge is the single most
distinctive part of Liquid Glass, and it is the one CSS cannot do in Safari.
Producing it requires an SVG displacement map applied as a backdrop filter —
`backdrop-filter: url(#filter)` with `feDisplacementMap`. WebKit does not
support SVG filters in `backdrop-filter`; Chromium renders some cases. This is
tracked as [w3c/svgwg#1142](https://github.com/w3c/svgwg/issues/1142), which is
a request to define interoperable backdrop displacement *because* no such thing
exists today. Every "pure CSS Liquid Glass" library on GitHub either fakes the
refraction with a static gradient ring or is Chromium-only. Treat all of them
as unusable here.

**Safari 26 shipped no new Liquid Glass CSS.** WebKit added no `glass-effect`
property, no material keyword, nothing. What changed is that Safari's *own*
browser chrome now samples `background-color` and `backdrop-filter` from
`position: fixed`/`sticky` elements near the viewport edges to tint its
toolbar, and ignores `<meta name="theme-color">` entirely. That matters for
biblequest.co in mobile Safari. It does **not** apply inside a Capacitor
WKWebView, which has no browser chrome to tint. Do not conflate the two.

---

## 2. What the repo already has

### The tab bar

`src/components/app-shell/BottomNav.tsx` — a single `<nav>`, 149 lines,
rendered by `AppShell.tsx:101` on both web and native. Relevant facts:

- Positioning: `fixed inset-x-0 bottom-0 z-40 border-t border-mist bg-parchment
  pb-safe`, with `sm:bg-parchment/90 sm:backdrop-blur-md` as the base-layer
  fallback. It is edge-welded and square — the pre-iOS-26 shape.
- Five items, `min-h-[44px]` each, `aria-label="Primary"`, `aria-current="page"`
  on the active tab.
- The active indicator is a deliberately hard-edged 3px bar flush with the top
  hairline (`BottomNav.tsx:133-139`) — the comment says "deliberately
  unrounded", so this is a considered Paper decision, not an oversight.
- **It already mirrors native tab-bar behaviour on re-tap**: a second tap on the
  current tab scrolls to top, and honours `useShouldReduceMotion()`
  (`BottomNav.tsx:107-125`).
- It publishes its own measured height to `--app-bottom-nav-height` via a
  `ResizeObserver` (`BottomNav.tsx:48-73`).
- It returns `null` on three full-screen routes — `/app/prayer/new`,
  `/app/prayer/reflection/new`, `/app/games/seven-days` — and `AppShell.tsx:44`
  keeps a second, manually-synced copy of that same list to drop the `pb-28`
  spacer.

### The glass utility

`app-glass-nav`, `src/app/globals.css:559-567` (dark variant at 580-586), inside
an `@supports` guard for `backdrop-filter`:

```css
html.glass-surfaces [data-app-shell] .app-glass-nav {
  background-color: color-mix(in srgb, var(--color-parchment) var(--glass-nav-opacity), transparent) !important;
  border-color: color-mix(in srgb, var(--color-paper) 66%, var(--color-mist)) !important;
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.42),
    0 -10px 34px rgb(18 33 27 / 0.1);
  -webkit-backdrop-filter: blur(20px) saturate(1.34);
  backdrop-filter: blur(20px) saturate(1.34);
}
```

`--glass-nav-opacity: 58%` (`globals.css:205`). The `glass-surfaces` root class
is user-controlled — `appearance.glassSurfaces`, default `true`
(`src/lib/questos/types.ts:576,644`), applied by
`src/lib/appearance/theme.ts:27` and pre-hydration by
`src/lib/appearance/bootstrap.ts:33`.

### How far that gets us

Further than expected. Against the table in §1, `app-glass-nav` already ships
five of the six *static* material properties. Eyeballing the delta, the
existing bar is roughly **70% of the static read** of an iOS 26 tab bar. The
visible gap is almost entirely:

- **Shape.** Edge-welded and square, where iOS 26 floats an inset capsule. This
  is the single biggest tell, and it is a positioning and `border-radius`
  change.
- **Behaviour.** No minimize-on-scroll.
- **Refraction and specular.** Unreachable, and least noticeable on parchment.

### The constraints already encoded in tests

`tests/glass-scroll-cost.test.ts` is a source-text contract test over
`globals.css` and it will fail on careless glass work:

- **Every backdrop blur radius must be ≤ 20px.** The nav is already *at* the
  ceiling at 20px. Note the regex `/backdrop-filter:\s*blur\((\d+)px\)/g` is
  unanchored, so it matches the `-webkit-` prefixed declaration too — both
  copies are checked. Any plan that reaches for a richer blur has to move this
  test and justify it, and the justification would have to beat the reason it
  exists (seventeen simultaneous blurs caused measured scroll stutter).
- **The nav rule must keep a `backdrop-filter`.** The test explicitly protects
  the nav's blur from being gated behind `has-wallpaper` the way card blurs
  are, because "the tab bar sits above whatever is scrolling under it,
  wallpaper or not, and it is a single element rather than seventeen."
- Card surfaces must *stay* gated on `has-wallpaper`, and must keep fill,
  border and shadow ungated.

Three other tests read files in this blast radius:
`tests/appearance-theme-apply.test.ts`, `tests/bible-native-reader.test.ts`,
`tests/launch-content.test.ts`.

### The four DOM consumers

Anything that removes the `<nav>` from the DOM has to re-home all of these:

| Consumer | Coupling |
|---|---|
| `src/components/shepherd/FloatingMyShepherd.tsx:66,199` | positions off `var(--app-bottom-nav-height)`, and queries `[data-app-bottom-nav]` directly |
| `src/components/design-system/Toast.tsx:156` | `bottom: calc(var(--app-bottom-nav-height,5rem) + ...)` |
| `src/components/app-shell/InstallPrompt.tsx:167` | same variable |
| `src/components/bible/ChapterReader.tsx:124` + `globals.css:400` | focus mode hides `[data-app-bottom-nav]` via CSS |

---

## 3. The three options

### Option A — CSS approximation of the existing DOM bar

Keep one `<nav>`. Add the floating capsule shape and minimize-on-scroll, both
additive behind `isNativeTarget()` where they should not apply to web.

**Cost:** 1–2 days. Touches `BottomNav.tsx`, `globals.css`, and the `pb-28`
spacer in `AppShell.tsx`.

**What you get:** the shape fix, which is the biggest single tell; scroll
minimize; a tighter capsule that also reclaims vertical space — which is
directly aligned with the owner's "space saving" note.

**What you do not get:** refraction, motion specular, luminance adaptation,
system consistency.

**Risks:**
- The 20px blur ceiling is already reached. There is no headroom to make the
  material *denser* without renegotiating `glass-scroll-cost.test.ts`.
- Minimize-on-scroll must respect `prefers-reduced-motion` (the codebase
  already has `useShouldReduceMotion()`) and must not swallow the existing
  re-tap-scrolls-to-top behaviour.
- A floating capsule changes the measured height, which flows to all four
  consumers automatically via the `ResizeObserver` — but `pb-28` in
  `AppShell.tsx:93` is a hardcoded literal and will need re-checking.
- Rounding the bar puts pressure on the "deliberately unrounded" active
  indicator. That is a Paper design decision to revisit consciously, not
  silently.

**Web parity:** intact. Gate the capsule/minimize behind `isNativeTarget()` if
web should keep the current bar; both branches fold to a constant at build
time and the component stays single.

### Option B — a real `UITabBar` hosted by Capacitor, WebView below

**The integration point exists and is one line.**
`ios/App/App/SceneDelegate.swift:11` currently reads:

```swift
window?.rootViewController = CAPBridgeViewController()
```

That is where a `UITabBarController` would go. (`Main.storyboard` also declares
`CAPBridgeViewController`, and `Info.plist` sets both `UIMainStoryboardFile` and
a scene-manifest `UISceneStoryboardFile` — the SceneDelegate assignment happens
last and wins, but the storyboard path is dead weight that needs auditing
before anyone touches this.)

**The hard part is not the one line.** `UITabBarController` wants one view
controller per tab. BibleQuest has *one* WebView that routes internally. Five
bridge controllers is not an option — five WebViews means five Zustand stores,
five IndexedDB readers, and five copies of the `biblequest:v1` blob racing each
other. So the real shape is: five empty placeholder VCs, the single
`CAPBridgeViewController` kept as a sibling underneath, and `didSelect`
intercepted and forwarded into the web router.

**This is where a specific, unresolved problem appears.** With the WebView
parented as a sibling rather than inside the selected tab's VC, UIKit has no
scroll view to observe — so `tabBarMinimizeBehavior` very likely never fires,
and minimize-on-scroll is lost. That is the marquee iOS 26 behaviour. The
alternatives are both bad: re-parent the bridge VC into each tab on selection
(WebView reflow on every tab change), or drop to a bare `UITabBar` subview,
which is simpler but has no `tabBarMinimizeBehavior` at all because that
property lives on the *controller*. **Verify this on device before committing
to Option B** — it materially changes the value proposition.

Note that Liquid Glass sampling *does* work over a WebView: a `UITabBar` above
a `WKWebView` in the same window samples the composited web content beneath it,
which is exactly the mechanism the third-party plugins rely on. That part is
fine.

**Cost:** 1–2 weeks, plus ongoing Swift maintenance in a repo that currently
has none beyond stock Capacitor scaffolding.

**What breaks:**
- **The single-component-set rule** — this is the direct violation. Native gets
  a bar that does not exist on web. Not "additive behind `isNativeTarget()`";
  a genuine fork of the navigation layer.
- **All four `--app-bottom-nav-height` consumers.** The DOM node is gone, so
  the height has to be pushed *back* across the bridge into a CSS variable.
- **Accessibility.** VoiceOver would traverse a native `UITabBar` — which is
  arguably *better* natively, but focus order between native chrome and web
  content becomes a new thing to get right, and the app's existing
  `aria-label="Primary"` / `aria-current` contract stops being the source of
  truth.
- **i18n.** `t.nav[key]` is resolved in React from the persisted language.
  Labels now have to be serialized to Swift on every language change.
- **The three hide-routes** and the re-tap-scroll-to-top behaviour both become
  bridge messages.
- **Icons.** `IconHome`/`IconQuest`/etc. are React SVG components. They become
  SF Symbols (off-brand) or rasterized/serialized SVG.
- **`contentInset: "always"`** in `capacitor.config.ts` interacts with native
  chrome insets and will need re-derivation.

**What you gain beyond looks:** a stronger Guideline 4.2 posture. Apple's
rejection language for WebView wrappers explicitly asks for "native
navigation," and a real `UITabBar` is the most literal possible answer. Given
this app already avoids `server.url` for exactly that reason, that is a real
non-cosmetic benefit.

### Option C — a third-party Capacitor plugin

Two exist:

**`@capgo/capacitor-native-navigation`** — MPL-2.0, Capacitor 8 + Node 22, which
matches this repo (Capacitor 8.5.0). Keeps a single WebView for bridge
stability, owns the native bars, exposes insets as CSS variables
(`--cap-native-navigation-bottom`), and emits `tabSelect` / `navbarBack` events
for the web router to consume. Explicitly: "your router still owns route state
and page rendering." On iOS 26+ it lets the system render Liquid Glass; older
iOS gets translucent fallbacks. Roughly 28 stars, ~168 commits, pre-1.0.

**`stay-liquid`** — iOS 26+ only with automatic fallback, tab bar is the only
component implemented, ~47 stars, ~29 commits, self-described
proof-of-concept, **not published to npm** (GitHub install only).

**Cost:** 3–5 days for capgo, less for stay-liquid.

**Risks, and why this is the option I would reject:**
- **It is a new runtime dependency, which the brief forbids.** The native
  bundle ships inside the binary; adding a pre-1.0 third-party navigation layer
  to it is precisely the kind of dependency that constraint exists to prevent.
- Both are pre-1.0 with small maintainer surface. A navigation layer is not
  where you want an unmaintained dependency.
- `stay-liquid` is not on npm — no integrity pinning, no supply-chain story.
- MPL-2.0 (capgo) is file-level copyleft. Fine for consuming unmodified, but
  patches to its files must be published. Worth a decision, not a surprise.
- It inherits **every** breakage in Option B's list — the fork, the four
  consumers, i18n, icons, a11y — while *also* putting a third party between you
  and the fix.
- Capgo's own docs do not state a minimum iOS version, only that iOS 26+ gets
  Liquid Glass. Unverified against this project's iOS 15 floor.

If Option B's device prototype proves out, read capgo's source for its inset
and event plumbing and reimplement the ~200 lines directly. Same result, no
dependency.

### Side-by-side

| | A — CSS | B — native `UITabBar` | C — plugin |
|---|---|---|---|
| Effort | 1–2 days | 1–2 weeks | 3–5 days |
| New runtime dependency | no | no | **yes — violates brief** |
| Single component set | **preserved** | broken | broken |
| Web parity | full | native-only fork | native-only fork |
| Refraction / specular | no | yes | yes |
| Minimize-on-scroll | hand-built, works | **uncertain — verify** | plugin's problem |
| Swift maintenance | none | ongoing | some |
| Guideline 4.2 posture | unchanged | improved | improved |
| Reversibility | trivial | costly | costly |

---

## 4. Apple guidelines, review, and the minimum-iOS question

**The app is already partly in iOS 26.** Xcode is 26.6 (build 17F113), so the
binary links against the iOS 26 SDK, and `Info.plist` does **not** contain
`UIDesignRequiresCompatibility`. That means system-rendered chrome — status
bar, keyboard, alerts, share sheet, and the Icon Composer app icon noted in
`IOS_UX_PASS_HANDOFF.md` — already gets the new design. The DOM tab bar is the
one surface that now reads as a period mismatch. **This is a live inconsistency,
not a hypothetical one**, which is a fair argument for doing at least Option A.

**Do not set `UIDesignRequiresCompatibility`.** It would opt the whole app out
and forfeit the icon variants already earned. Apple positions it as a
debug/testing flag, it is expected to be removed in the next major Xcode, and
the practical adoption deadline being quoted is around April 2027.

**Liquid Glass is not a review requirement.** I found no guideline requiring it
and no evidence of rejections for its absence. Guideline 4.2 is about
functionality and "app-like" experience, not material fidelity. Option A does
not create review risk; Option B/C would modestly *improve* the 4.2 story.

**The minimum-iOS-version question.** The project floor is iOS 15
(`IPHONEOS_DEPLOYMENT_TARGET = 15.0` in four places in
`project.pbxproj`; `platforms: [.iOS(.v15)]` in
`ios/App/CapApp-SPM/Package.swift`, which is CLI-managed — do not hand-edit).
Liquid Glass exists only on iOS 26+.

- **Option A needs no change.** `backdrop-filter` has been supported in WebKit
  since iOS 9, and the `@supports` guard already handles the rest.
- **Options B/C need `if #available(iOS 26.0, *)` with a real fallback path** —
  meaning two tab bars to design and maintain, not one.
- **Do not raise the floor to 26** to avoid that. It is a year old and would
  cut a large share of installed devices.
- Raising the floor to iOS 16 or 17 is nearly free in August 2026 and worth
  doing for unrelated reasons, but it does not help here — anything below 26
  still needs the fallback.

---

## 5. Staged plan

### Stage 0 — measure before building (half a day)

Do this first; it decides whether the later stages are worth anything.

1. Screenshot the current bar on an iOS 26 device beside a first-party app
   (Music, Podcasts) at the same scroll position, light and dark, with and
   without a wallpaper set.
2. Confirm whether the honest delta is shape, refraction, or both. My claim is
   shape dominates; a screenshot settles it in ten minutes.
3. Check the bar against Dynamic Type at the largest accessibility sizes — the
   capsule shape in Stage 1 has less horizontal room than the full-bleed bar
   does.

### Stage 1 — CSS floating capsule (1–2 days) — *recommended, do this*

- Inset the bar and fully round it; keep `pb-safe`, add horizontal inset.
- Retune `app-glass-nav` for a floating element: the `border-t` hairline stops
  making sense on a capsule, and the `0 -10px 34px` upward shadow wants to
  become an all-round ambient shadow.
- Reconsider the 3px active indicator against a rounded container — deliberately,
  and note the decision.
- **Stay at or under the 20px blur ceiling.** Do not touch
  `tests/glass-scroll-cost.test.ts`.
- Recheck `pb-28` in `AppShell.tsx:93` against the new measured height.
- Verify all four `--app-bottom-nav-height` consumers still sit correctly.
- Decide explicitly whether web gets the capsule too, or whether it is gated
  behind `isNativeTarget()`. Either is fine; drifting into it is not.

### Stage 2 — minimize on scroll (1 day)

- Scroll listener collapsing the bar on scroll-down, expanding on scroll-up.
- Hard requirements: honour `useShouldReduceMotion()`; do not break re-tap
  scroll-to-top; keep the bar reachable by keyboard at all times; never leave
  it collapsed at rest with no way back.
- Publish the *collapsed* height too, or the four consumers will jump.

### Stage 3 — native prototype, throwaway branch (3–4 days, spike)

Timeboxed, explicitly not merged. Answer three questions:

1. Does `tabBarMinimizeBehavior` fire at all with the bridge VC parented as a
   sibling? (The §3 concern. If no, Option B loses most of its advantage.)
2. Does Liquid Glass sample the WebView content cleanly, or does the parchment
   palette turn to grey mud under a cool-toned material?
3. What does the iOS 15–25 fallback bar actually look like, and who maintains
   two of them?

### Stage 4 — decision gate

Adopt native **only if** Stage 3 answers (1) yes and (2) well, and someone has
signed up for the Swift maintenance and the second fallback bar. Otherwise stop
at Stage 2 and write down why.

### Explicitly out of scope

- Any "pure CSS Liquid Glass" library from GitHub. They are Chromium-only or
  fake the refraction, and they are new dependencies.
- Raising the deployment target to iOS 26.
- Setting `UIDesignRequiresCompatibility`.
- Doing any of this before the 10-day polish deadline. The owner's actual
  complaints are quest browsing and onboarding density; the tab bar is not on
  that list.

---

## 6. The design tension worth naming

Liquid Glass is a cool, neutral, high-clarity, optically-active material. Paper
is warm parchment, graphite text, gilt labels, Fraunces — a deliberately calm,
matte, analogue language. These are not the same idea.

Chasing full Liquid Glass fidelity on a bottom bar risks a tab bar that looks
borrowed from a different app. The existing `app-glass-nav` is a *translation*
of the material into Paper's palette — 58% parchment, warm shadow, white rim —
and that is the right instinct. Stage 1 should adopt iOS 26's **shape and
behaviour**, which read as current and cost nothing in brand terms, and leave
the **material** in Paper's dialect. That also happens to be the cheap half.

---

## 7. Open questions to resolve before Stage 3

- Does `tabBarMinimizeBehavior` fire with a sibling-parented WebView? (blocking
  for Option B)
- Is `Main.storyboard` reachable at all given the SceneDelegate override, and
  can it be deleted?
- What is `@capgo/capacitor-native-navigation`'s actual iOS floor? Undocumented.
- If native chrome lands, does `contentInset: "always"` stay correct, or does it
  need to become `never` with manual inset math?
- Does the App Store screenshot set need regenerating if the bar shape changes?

---

## Sources

- [Build a UIKit app with the new design — WWDC25](https://developer.apple.com/videos/play/wwdc2025/284/)
- [Exploring tab bars on iOS 26 with Liquid Glass — Donny Wals](https://www.donnywals.com/exploring-tab-bars-on-ios-26-with-liquid-glass/)
- [Opting your app out of the Liquid Glass redesign with Xcode 26 — Donny Wals](https://www.donnywals.com/opting-your-app-out-of-the-liquid-glass-redesign-with-xcode-26/)
- [Opt Out of Liquid Glass with One Info.plist Key — Mehmet Baykar](https://mehmetbaykar.com/posts/opt-out-of-liquid-glass-with-one-infoplist-key/)
- [Safari 26 Liquid Glass: toolbar tinting, white bars, viewport bugs](https://1ar.io/updates/safari-26-liquid-glass-web/)
- [w3c/svgwg#1142 — define interoperable backdrop displacement/refraction](https://github.com/w3c/svgwg/issues/1142)
- [Cap-go/capacitor-native-navigation](https://github.com/Cap-go/capacitor-native-navigation) · [docs](https://capgo.app/docs/plugins/native-navigation/)
- [alistairheath/stay-liquid](https://github.com/alistairheath/stay-liquid)
- [Liquid Glass in iOS 26: A UIKit Developer's Guide](https://medium.com/@ios-interview/liquid-glass-in-ios-26-a-uikit-developers-guide-9aa1c91bf139)
- [WWDC25: Build a UIKit App with the New Liquid Glass Design — Appcircle](https://appcircle.io/blog/wwdc25-build-a-uikit-app-with-the-new-liquid-glass-design)
- [App Store Review Guidelines: Will Your Webview App Be Rejected?](https://www.mobiloud.com/blog/app-store-review-guidelines-webview-wrapper)
