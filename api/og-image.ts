/**
 * OG image renderer for the Workers API (workers-og: satori + resvg wasm).
 * Same layout as supabase/functions/make-server-283d8046/og-image.tsx, built as plain
 * element objects so the Worker needs no React. Fonts are static TTFs: satori can't read
 * variable fonts or woff2.
 */
import { ImageResponse } from "workers-og";

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

// Brand colors from theme (purple gradient, white text)
const BG_TOP = "#030213";
const BG_BOTTOM = "#4c1d95"; // purple-800
const TEXT_WHITE = "#ffffff";
const SUBTITLE_OPACITY = 0.9;

// Google Sans Flex static cuts (scripts/build-og-fonts.py), served by the site Worker.
// Title = wght 600 + rounded, body = wght 400 square. Falls back to Livvic if unreachable.
const FONT_FAMILY = "Google Sans Flex";
const OG_FONTS = [
  { url: "https://heresmychurch.com/fonts/og/GoogleSansFlex-Body.ttf", weight: 400 as const },
  { url: "https://heresmychurch.com/fonts/og/GoogleSansFlex-Title.ttf", weight: 600 as const },
];
const FALLBACK_FONTS = [
  { url: "https://fonts.gstatic.com/s/livvic/v15/rnCp-x1S2hzjrlfnbw.ttf", weight: 400 as const },
  { url: "https://fonts.gstatic.com/s/livvic/v15/rnCq-x1S2hzjrlfft8cesg.ttf", weight: 600 as const },
];

type Font = { name: string; data: ArrayBuffer; weight: 400 | 600; style: "normal" };
let cachedFonts: Promise<Font[]> | null = null;

async function loadFonts(list: typeof OG_FONTS): Promise<Font[]> {
  return Promise.all(
    list.map(async ({ url, weight }) => {
      const res = await fetch(url, { cf: { cacheTtl: 86400 * 30, cacheEverything: true } } as RequestInit);
      if (!res.ok) throw new Error(`Font fetch failed: ${res.status} ${url}`);
      // Same family name either way so the layout's fontFamily matches.
      return { name: FONT_FAMILY, data: await res.arrayBuffer(), weight, style: "normal" as const };
    }),
  );
}

function getFonts(): Promise<Font[]> {
  if (!cachedFonts) {
    cachedFonts = loadFonts(OG_FONTS)
      .catch((e) => {
        console.log(`OG fonts: ${e}; falling back to Livvic`);
        return loadFonts(FALLBACK_FONTS);
      })
      .catch((e) => {
        cachedFonts = null; // retry on the next request
        throw e;
      });
  }
  return cachedFonts;
}

export interface OgImageParams {
  type: "state" | "church";
  stateName?: string;
  churchName?: string;
  city?: string;
  stateAbbrev?: string;
  denomination?: string;
}

type El = { type: string; props: { style?: Record<string, unknown>; children?: unknown } };
const div = (style: Record<string, unknown>, children: unknown): El => ({ type: "div", props: { style, children } });

const frame = (children: El[]): El =>
  div(
    {
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      background: `linear-gradient(180deg, ${BG_TOP} 0%, ${BG_BOTTOM} 100%)`,
      fontFamily: FONT_FAMILY,
      padding: 80,
    },
    children,
  );

export async function generateOgImage(params: OgImageParams): Promise<Response> {
  const fonts = await getFonts();

  const el =
    params.type === "state"
      ? frame([
          div({ fontSize: 72, fontWeight: 600, color: TEXT_WHITE, textAlign: "center", marginBottom: 24 }, params.stateName ?? "Churches"),
          div({ fontSize: 32, fontWeight: 400, color: TEXT_WHITE, opacity: SUBTITLE_OPACITY }, "Here's My Church"),
        ])
      : frame(
          [
            div(
              { fontSize: 56, fontWeight: 600, color: TEXT_WHITE, textAlign: "center", marginBottom: 20, maxWidth: "90%" },
              params.churchName ?? "Church",
            ),
            params.city || params.stateAbbrev
              ? div(
                  { fontSize: 28, fontWeight: 400, color: TEXT_WHITE, opacity: SUBTITLE_OPACITY, marginBottom: 12 },
                  [params.city, params.stateAbbrev].filter(Boolean).join(", "),
                )
              : null,
            params.denomination
              ? div({ fontSize: 24, fontWeight: 400, color: TEXT_WHITE, opacity: 0.85, marginBottom: 16 }, params.denomination)
              : null,
            div({ fontSize: 26, fontWeight: 400, color: TEXT_WHITE, opacity: SUBTITLE_OPACITY }, "Here's My Church"),
          ].filter(Boolean) as El[],
        );

  return new ImageResponse(el as any, {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts,
    headers: {
      "Cache-Control": "public, max-age=86400, s-maxage=86400, no-transform",
    },
  });
}
