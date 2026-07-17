# Winterhill embed security contract

## Contract and ownership

BibleQuest permits framing only from these CSP `frame-ancestors` sources:

1. `'self'`
2. `https://winterhill.studio`
3. `https://www.winterhill.studio`

The list is exact. Wildcards, HTTP origins, broad subdomain patterns,
localhost production exceptions, and any other origin are denied. Production
must omit `X-Frame-Options`: that older header cannot represent this
multi-origin allowlist, and `DENY` or `SAMEORIGIN` would conflict with the
approved Winterhill preview.

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

The CSP header currently applies to all BibleQuest routes. Winterhill is
therefore a trusted framing origin and must not deep-link its iframe to `/app`,
`/app/account`, `/onboarding`, or another personal flow. Those routes can use
browser-local or authenticated data after user action.

Navigation inside the landing page intentionally remains in the iframe: its
internal links and calls to action use normal same-frame navigation. Winterhill
should provide any “open the full project” or new-tab control outside the iframe
instead of injecting embed detection or privileged query parameters into
BibleQuest. Do not add a query-string or localhost bypass for framing.

## Automated verification

`tests/security-headers.test.ts` loads the production Next.js header rules,
parses CSP by directive and source token, and verifies:

- the `frame-ancestors` source set is exactly the three entries above;
- all production Next.js header rules omit `X-Frame-Options`; and
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
```

The response must contain the exact `frame-ancestors` set and no
`X-Frame-Options` line.

## Winterhill-side acceptance test

After the corresponding Winterhill page is available, test in a real browser:

1. Load the preview from `https://winterhill.studio` and from
   `https://www.winterhill.studio`; the public BibleQuest landing page must
   render in both.
2. Confirm the initial page contains only public demo content and that an
   internal link stays inside the frame.
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
