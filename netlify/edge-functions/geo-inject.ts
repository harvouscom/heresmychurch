/**
 * Netlify Edge Function: inject detected country (+ US subdivision) into HTML
 * so the client can land visitors in their country and (for the US) preselect
 * a state. Unsupported / unknown geo falls through to /world on the client.
 * Uses context.geo (no third-party API).
 *
 * DC is mapped to MD (DC churches are folded into MD).
 */
import type { Context } from "https://edge.netlify.com";

const SUPPORTED_COUNTRIES = new Set([
  "US", "CA", "GB", "IE",
  "FR", "DE", "NL", "BE", "ES", "IT", "PT", "AT", "CH",
  "SE", "NO", "DK", "FI", "PL", "AU",
]);

const VALID_US_STATES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
]);

export default async function handler(request: Request, context: Context): Promise<Response> {
  const response = await context.next();
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return response;

  const country = context.geo?.country?.code?.toUpperCase();
  if (!country || !SUPPORTED_COUNTRIES.has(country)) return response;

  let subdivision = context.geo?.subdivision?.code?.toUpperCase() ?? null;
  if (country === "US") {
    if (!subdivision || !VALID_US_STATES.has(subdivision)) subdivision = null;
    else if (subdivision === "DC") subdivision = "MD";
  } else {
    // Non-US subdivisions are only useful once region landing is wired; still
    // inject the country so `/` opens Canada for Canadian visitors.
    subdivision = null;
  }

  const html = await response.text();
  const tags = [
    `<meta name="x-user-country" content="${country}" />`,
    subdivision ? `<meta name="x-user-region" content="${subdivision}" />` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const out = html.replace("</head>", `${tags}\n</head>`);
  return new Response(out, { status: response.status, headers: response.headers });
}
