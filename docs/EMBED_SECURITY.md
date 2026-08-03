# Winterhill embed security contract

## Contract and ownership

BibleQuest permits its public homepage (`/`) to be framed only from these CSP
`frame-ancestors` sources:

1. `'self'`
2. `https://winterhill.studio`
3. `https://www.winterhill.studio`

The list is exact. Wildcards, HTTP origins, broad subdomain patterns,
localhost production exceptions, and any other origin are denied. The homepage
omits `X-Frame-Options` because that older header cannot represent this
multi-origin allowlist. Every other route sends `frame-ancestors 'none'` and
`X-Frame-Options: DENY`, including app, onboarding, auth, console, and API
routes.

The BibleQuest repository/deployment owner (currently Brendan Kenney) owns the
exception and its CSP tests. The Winterhill site owner owns the consuming iframe
and the browser acceptance test on both canonical Winterhill origins. Security
headers have one repository source of truth: `next.config.ts`; do not add CSP or
`X-Frame-Options` overrides in `vercel.json` or the Vercel project settings.

## Content and navigation boundary

The portfolio iframe must start at the canonical public landing page:

```html
<iframe src="https://www.biblequest.co/" title="BibleQuest project preview"></iframe>
```

The landing page renders public marketing copy and fixed demo/seed content. It
does not read the Supabase session, redirect based on authentication, or render
prayers, reflections, notes, or other persisted user records. This is the only
page approved as the preview's initial URL.

Winterhill must not deep-link its iframe to `/app`, `/app/account`,
`/onboarding`, or another personal flow. Browsers refuse those framed routes
even when the ancestor is Winterhill, so private browser-local or authenticated
data never renders inside the portfolio.

Public in-page anchors remain usable inside the landing page. App/onboarding
navigation is intentionally denied inside the frame. Winterhill should provide
an “open the full project” control outside the iframe rather than injecting
embed detection or privileged query parameters into BibleQuest. Do not add a
query-string or localhost bypass for framing.

## Automated verification

`tests/security-headers.test.ts` loads the production Next.js header rules,
parses CSP by directive and source token, and verifies:

- the homepage `frame-ancestors` source set is exactly the three entries above;
- every non-homepage route uses `frame-ancestors 'none'` plus
  `X-Frame-Options: DENY`; and
- `vercel.json` does not define a second CSP or frame-policy header.

Run the focused contract test with:

```bash
pnpm exec vitest run tests/security-headers.test.ts
```

## Manual denied-origin check

The local fixture is test-only and is not shipped from `public/`:

1. Build and start BibleQuest in production mode with `pnpm build && pnpm start`.
2. In another terminal, run
   `python3 -m http.server 4173 --directory tests/manual`.
3. Open
   `http://localhost:4173/iframe-denied-origin.html` and the browser console.
4. Confirm the iframe is blocked and the console cites the page's
   `frame-ancestors` policy. It must not render after adding an `Origin` request
   header; CSP checks the actual ancestor chain, not that request header.

Also inspect the deployed response without treating `curl` as a browser embed
test:

```bash
curl -sSIL https://www.biblequest.co/ \
  | grep -iE '^(content-security-policy|x-frame-options):'
curl -sSIL https://www.biblequest.co/app \
  | grep -iE '^(content-security-policy|x-frame-options):'
```

The homepage response must contain the exact Winterhill `frame-ancestors` set
and no `X-Frame-Options` line. `/app` must contain `frame-ancestors 'none'` and
`X-Frame-Options: DENY`.

## Winterhill-side acceptance test

After the corresponding Winterhill page is available, test in a real browser:

1. Load the preview from `https://winterhill.studio` and from
   `https://www.winterhill.studio`; the public BibleQuest landing page must
   render in both.
2. Confirm the initial page contains only public demo content, public in-page
   anchors work, and a direct framed request to `/app` is refused.
3. Serve the same iframe temporarily from an unrelated HTTPS origin under the
   owner's control (or use the localhost fixture above); it must be blocked.
4. Inspect the framed BibleQuest response in DevTools and confirm there is one
   CSP header with the exact source set and no `X-Frame-Options` header.

This browser check is required because response-header inspection alone cannot
prove that redirects and the complete ancestor chain are accepted.

## Removing the exception

If the portfolio preview is retired, the BibleQuest repository/deployment owner
must remove the two Winterhill sources, change `frame-ancestors` back to
`'none'`, restore `X-Frame-Options: DENY` as an aligned legacy defense, and
update this test contract in the same change. After deployment, verify the live
response and confirm both Winterhill origins can no longer frame BibleQuest.
