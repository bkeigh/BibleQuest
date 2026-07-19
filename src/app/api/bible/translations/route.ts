import { NextResponse } from "next/server";
import {
  apiBibleConfigured,
  listApprovedApiBibles,
} from "@/lib/bible/api-bible";
import {
  FEATURED_TRANSLATIONS,
  HELLOAO_OPEN_TRANSLATIONS,
  WEB_TRANSLATION,
  type BibleTranslation,
} from "@/lib/bible/translations";
import { guardProviderRequest } from "@/lib/bible/provider-request-guard";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const blocked = guardProviderRequest(request, "bible-translations", [
    { limit: 10, windowMs: 60_000 },
    { limit: 60, windowMs: 60 * 60_000 },
  ]);
  if (blocked) return blocked;

  let connected: BibleTranslation[] = [];
  let providerError = false;
  if (apiBibleConfigured()) {
    try {
      connected = await listApprovedApiBibles();
    } catch {
      providerError = true;
    }
  }

  const connectedByKey = new Map(connected.map((item) => [item.key, item]));
  const openByKey = new Map(
    HELLOAO_OPEN_TRANSLATIONS.map((item) => [item.key, item]),
  );
  const featured = FEATURED_TRANSLATIONS.map((item) =>
    openByKey.get(item.key) ?? (item.key === WEB_TRANSLATION.key
      ? WEB_TRANSLATION
      : connectedByKey.get(item.key) ?? item),
  );
  const featuredKeys = new Set(featured.map((item) => item.key));
  const apiBibleProvider = {
    name: "API.Bible",
    configured: apiBibleConfigured(),
    error: providerError,
  };
  const helloAoProvider = {
    name: "HelloAO Free Use Bible API",
    configured: true,
    error: false,
  };

  return NextResponse.json(
    {
      provider: apiBibleProvider,
      providers: {
        apiBible: apiBibleProvider,
        helloAo: helloAoProvider,
      },
      translations: [
        ...featured,
        ...HELLOAO_OPEN_TRANSLATIONS.filter(
          (item) => !featuredKeys.has(item.key),
        ),
        ...connected.filter(
          (item) =>
            !featuredKeys.has(item.key) && !openByKey.has(item.key),
        ),
      ],
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
