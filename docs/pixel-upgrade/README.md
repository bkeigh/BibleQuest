# BibleQuest Pixel Upgrade — Production Kit

Turnkey plan to generate the reference-sheet assets, replace the current pixel
art, and wire it into the registry. Built while you slept, so read this first.

**Status: ready to generate — blocked only on PixelLab auth.**

---

## 1. The one thing to fix (2 min)

PixelLab can't generate in this session yet. The connected PixelLab MCP returns
`401: Missing Authorization header`, and the sandbox is firewalled off from
`api.pixellab.ai`, so the token you pasted can't be injected from my side.

Fix: make sure the PixelLab connector carries your token — the exact block you
pasted is correct, it just isn't live on the connected instance:

```json
"pixellab": {
  "url": "https://api.pixellab.ai/mcp",
  "headers": { "Authorization": "Bearer 3622bf22-…" }
}
```

Add/confirm that `headers.Authorization` on the PixelLab connector (Claude →
Settings → Connectors → PixelLab), reconnect, then tell me "PixelLab is live"
and I'll run the whole manifest.

## 2. What I did / didn't touch

- **Did:** read your whole pixel system, reconciled the reference sheet against
  the registry, and wrote a complete generation spec: `asset-manifest.json`
  (62 assets, every one with a tuned prompt, exact dimensions, and animation
  plan) plus this plan.
- **Did NOT:** touch a single line of live source. Adding `kind:"png"` registry
  entries that point at PNGs that don't exist yet would render broken images and
  could break your build. Those edits are staged here for review, applied only
  after the art lands.

## 3. Scope decisions I made for you (all easy to change)

- **Everything in one pass**, as you asked — 44 core assets now, 14 optional
  (6 nav icons + 8 mascots) flagged separately.
- **The reference sheet is the target, not the current app.** Today's icons are
  tiny hand-placed "marks" (5–8 cells). The sheet is richer 32-bit art. So this
  upgrades icon/feature/tile assets to PixelLab **PNGs**, using your documented
  PNG-swap workflow (drop in `public/pixel/`, flip one registry entry).
- **Kept your architecture intact.** Each PNG keeps the logical grid of the
  sprite it replaces, so rendered sizes and every call site stay unchanged.
- **Respected your own rule** that nav/tab bars use vector icons — the 6
  bottom-nav pixel icons on the sheet are in the manifest but marked
  `optional`, off by default. Say the word to promote them.
- **Content-guide safe:** the Forgiveness glyph reads as *release*, and the
  streak candle is never a loss/punishment motif — an unlit candle is "waiting
  to be lit."

## 4. Style guide → PixelLab settings

Your sheet maps almost 1:1 onto PixelLab controls (baked into every prompt):

| Your spec | PixelLab setting |
|---|---|
| 1–2px dark green/charcoal outline | `outline: single color outline` |
| 2–3 shade levels, minimal dither | `shading: basic shading` |
| Detailed hero objects (bible, lantern, window) | `detail: high detail` |
| Highlight upper-left, shadow lower-right | in prompt (model honors it) |
| Icons/objects front view | `view: side` |
| Ground tiles | `view: high top-down` (+ tileset tools for seamless) |
| Transparent-ready | `create_map_object` (transparent bg) |
| Brand palette | hex list embedded in every prompt |

## 5. Generate → normalize → drop → flip (the pipeline)

1. **Generate** each asset at `genCanvasPx` (usually 64–96px) for model quality.
2. **Normalize** to exact `pngPx` — trim transparent margins, nearest-neighbor
   snap-scale to the integer multiple of the logical grid, re-quantize to the
   brand palette. (Your PNG rule: file pixels must map to whole logical cells.)
3. **Drop** into `public/pixel/<id>.png`.
4. **Flip** the registry entry to `{ kind:"png", src:"/pixel/<id>.png", cols, rows }`.

Nothing else changes — names, sizes, a11y, importing files all stay put.

## 6. Animation plan (the three you chose)

- **Candle flame + streak stages** — the 5 states (`candle-unlit → -small →
  -steady → -sparks → -halo`) *are* the Day 0/1+/7+/30+ progression. Each lit
  PNG gets a subtle whole-image flicker via `ambientClassName`. Optional upgrade:
  a 6-frame PixelLab `animate_object` flame loop for a truer per-flame flicker.
- **Dove flight** — a 6-frame PixelLab `animate_character` wing-flap/hover loop.
  This is the one item that needs a *new* tiny renderer: a `PixelSprite` frame
  player (CSS `steps()` over a horizontal strip). I'll add it when we wire, kept
  behind the same `.ambient` reduced-motion kill-switch as everything else.
- **Sprout → tree growth** — the 6 tree stages already animate as a staged
  spring sequence in `GrowthTree.tsx`; regenerating them richer keeps that for
  free. Optional: PixelLab interpolation between stages for a true grow-in.

## 7. Proposed `CATEGORY_SPRITE` remap (after art lands)

Give the nine sheet categories their own glyphs (currently they reuse older
marks in `PixelIcon.tsx`):

```
prayer      → icon-prayer          (was candle)
scripture   → open-bible           (was book)
service     → icon-service         (was hands)
kindness    → icon-kindness        (was heart)
forgiveness → icon-forgiveness     (was dove)
gratitude   → icon-gratitude       (was flower/star)
silence     → icon-silence         (was leaf)
community   → icon-community        (was door)
reflection  → icon-reflection      (was compass)
```

Other categories (generosity, discipline, worship, family, patience,
evangelization, self-control, humility, patience) keep their current marks
until a later pass.

## 8. Staged registry edit (review — NOT applied)

Example of the single-line swaps that happen in step 4, e.g. for the candle:

```ts
// before
candle: { kind: "grid", palette: {…}, rows: […], ambient: {…} },
// after
candle: { kind: "png", src: "/pixel/candle.png", cols: 10, rows: 14,
          ambientClassName: "[animation:var(--animate-flicker)]" },
```

Every asset's exact `registryEntry` is in `asset-manifest.json`.

## 9. Run sequence once PixelLab is live

1. Generate all `status: upgrade|new` assets (skip `optional`) from the manifest.
2. Normalize + drop into `public/pixel/`.
3. Flip registry entries; add `PixelSprite` player for the dove.
4. Remap `CATEGORY_SPRITE`.
5. `npm run build` + a quick visual pass; iterate any misses (regen is cheap).
6. Then, if you want them: the 8 mascots and 6 nav icons.

## 10. Decisions for you to confirm (I picked sensible defaults)

- Promote the 6 **bottom-nav** pixel icons, or keep nav vector? *(default: keep vector)*
- Include the 8 **mascot** upgrades this round? *(default: yes, as a final phase)*
- Streak flame: whole-image flicker only, or the richer **6-frame** PixelLab
  flame + new player? *(default: ship flicker first, add frames if you like it)*
- Estimated PixelLab generations: ~44 core (×1–2 with retries) + ~18 animation
  frames. I'll check `get_balance` before a full run and warn if it's tight.

---

*Manifest: `asset-manifest.json` · System of record: `docs/PIXEL_SYSTEM.md` ·
Registry: `src/components/design-system/pixel-assets.ts`*
