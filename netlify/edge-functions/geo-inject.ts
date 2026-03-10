/**
 * Netlify Edge Function: inject detected US state/region into HTML for client-side state preselection.
 * Uses context.geo (no third-party API). DC is mapped to MD (DC churches are folded into MD).
 */
import type { Context } from "https://edge.netlify.com";

const VALID_STATES = new Set([
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

  const country = context.geo?.country?.code;
  let subdivision = context.geo?.subdivision?.code;
  if (country !== "US" || !subdivision || !VALID_STATES.has(subdivision))
    return response;

  // DC churches are folded into MD throughout the app
  if (subdivision === "DC") subdivision = "MD";

  const html = await response.text();
  const tag = `<meta name="x-user-region" content="${subdivision}" />`;
  const out = html.replace("</head>", `${tag}\n</head>`);
  return new Response(out, { status: response.status, headers: response.headers });
}
