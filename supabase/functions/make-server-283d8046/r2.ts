// Cloudflare R2 uploads for the public static files (states.json, churches/{REGION}.json).
//
// R2 speaks the S3 API; aws4fetch signs the requests. Publishing is disabled until
// all four secrets are set, so the function behaves exactly as before without them:
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
import { AwsClient } from "npm:aws4fetch@1.0.20";
import { env } from "./runtime.ts";

// Read lazily: on Workers the env only exists once a request arrives.
const ACCOUNT_ID = () => env("R2_ACCOUNT_ID") || "";
const ACCESS_KEY_ID = () => env("R2_ACCESS_KEY_ID") || "";
const SECRET_ACCESS_KEY = () => env("R2_SECRET_ACCESS_KEY") || "";
const BUCKET = () => env("R2_BUCKET") || "";

let _client: AwsClient | null = null;
function client(): AwsClient {
  if (!_client) {
    _client = new AwsClient({
      accessKeyId: ACCESS_KEY_ID(),
      secretAccessKey: SECRET_ACCESS_KEY(),
      service: "s3",
      region: "auto",
    });
  }
  return _client;
}

export function r2Enabled(): boolean {
  return !!(ACCOUNT_ID() && ACCESS_KEY_ID() && SECRET_ACCESS_KEY() && BUCKET());
}

/** Upload `value` as JSON at `path` (e.g. "churches/TX.json"). Throws on failure. */
export async function r2PutJson(path: string, value: unknown, cacheControl: string): Promise<void> {
  const url = `https://${ACCOUNT_ID()}.r2.cloudflarestorage.com/${BUCKET()}/${path}`;
  const res = await client().fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cacheControl,
    },
    body: JSON.stringify(value),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`R2 PUT ${path} failed: ${res.status} ${text.slice(0, 200)}`);
  }
}
