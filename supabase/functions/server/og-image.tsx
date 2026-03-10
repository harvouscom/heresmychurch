/** @jsxImportSource https://esm.sh/react@18.2.0 */
import React from "https://esm.sh/react@18.2.0";
import { ImageResponse } from "https://deno.land/x/og_edge@0.0.6/mod.ts";

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

// Brand colors from theme (purple gradient, white text)
const BG_TOP = "#030213";
const BG_BOTTOM = "#4c1d95"; // purple-800
const TEXT_WHITE = "#ffffff";
const SUBTITLE_OPACITY = 0.9;

let cachedFont: { name: string; data: ArrayBuffer; weight: number; style: "normal" }[] | null = null;

async function getLivvicFont(): Promise<{ name: string; data: ArrayBuffer; weight: number; style: "normal" }[]> {
  if (cachedFont) return cachedFont;
  // Livvic 400 and 600 from Google Fonts (woff2)
  const urls = [
    "https://fonts.gstatic.com/s/livvic/v14/rnCq-x1l2izCb9JZkFPYe8HVSo2.woff2",
    "https://fonts.gstatic.com/s/livvic/v14/rnCt-x1l2izCb9JZkFPkSdOSOdQ.woff2",
  ];
  const weights = [400, 600];
  const buffers = await Promise.all(urls.map((u) => fetch(u).then((r) => r.arrayBuffer())));
  cachedFont = buffers.map((data, i) => ({
    name: "Livvic",
    data,
    weight: weights[i],
    style: "normal" as const,
  }));
  return cachedFont;
}

export interface OgImageParams {
  type: "state" | "church";
  stateName?: string;
  churchName?: string;
  city?: string;
  stateAbbrev?: string;
  denomination?: string;
}

export async function generateOgImage(params: OgImageParams): Promise<Response> {
  const fonts = await getLivvicFont();

  const el =
    params.type === "state" ? (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: `linear-gradient(180deg, ${BG_TOP} 0%, ${BG_BOTTOM} 100%)`,
          fontFamily: "Livvic",
          padding: 80,
        }}
      >
        <div
          style={{
            fontSize: 72,
            fontWeight: 600,
            color: TEXT_WHITE,
            textAlign: "center",
            marginBottom: 24,
          }}
        >
          {params.stateName ?? "Churches"}
        </div>
        <div
          style={{
            fontSize: 32,
            fontWeight: 400,
            color: TEXT_WHITE,
            opacity: SUBTITLE_OPACITY,
          }}
        >
          Here's My Church
        </div>
      </div>
    ) : (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: `linear-gradient(180deg, ${BG_TOP} 0%, ${BG_BOTTOM} 100%)`,
          fontFamily: "Livvic",
          padding: 80,
        }}
      >
        <div
          style={{
            fontSize: 56,
            fontWeight: 600,
            color: TEXT_WHITE,
            textAlign: "center",
            marginBottom: 20,
            maxWidth: "90%",
          }}
        >
          {params.churchName ?? "Church"}
        </div>
        {(params.city || params.stateAbbrev) && (
          <div
            style={{
              fontSize: 28,
              fontWeight: 400,
              color: TEXT_WHITE,
              opacity: SUBTITLE_OPACITY,
              marginBottom: 12,
            }}
          >
            {[params.city, params.stateAbbrev].filter(Boolean).join(", ")}
          </div>
        )}
        {params.denomination && (
          <div
            style={{
              fontSize: 24,
              fontWeight: 400,
              color: TEXT_WHITE,
              opacity: 0.85,
              marginBottom: 16,
            }}
          >
            {params.denomination}
          </div>
        )}
        <div
          style={{
            fontSize: 26,
            fontWeight: 400,
            color: TEXT_WHITE,
            opacity: SUBTITLE_OPACITY,
          }}
        >
          Here's My Church
        </div>
      </div>
    );

  const res = new ImageResponse(el, {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts,
    headers: {
      "Cache-Control": "public, max-age=86400, s-maxage=86400, no-transform",
    },
  });
  return res;
}
