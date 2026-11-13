/**
 * Reviewer API proxy. Cloudflare Access protects heresmychurch.com/review*, signs the reviewer in,
 * and adds Cf-Access-Jwt-Assertion to requests that reach this Worker. /review/api/* is forwarded to
 * the HMC API with only that header and the content type; the API verifies the token itself.
 * Only moderation and audit routes are reachable this way.
 */
const ALLOWED = [/^\/moderate\//, /^\/audit\//];

export function isReviewApi(pathname: string): boolean {
  return pathname.startsWith("/review/api/");
}

export async function proxyReviewApi(request: Request, apiBase: string, fetcher: typeof fetch = fetch): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.slice("/review/api".length);
  if (!ALLOWED.some((re) => re.test(path)) || path.includes("..")) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) return Response.json({ error: "Sign in at /review first." }, { status: 401 });
  const headers = new Headers({ "cf-access-jwt-assertion": token });
  const type = request.headers.get("content-type");
  if (type) headers.set("content-type", type);
  const target = `${apiBase.replace(/\/$/, "")}${path}${url.search}`;
  const init: RequestInit = { method: request.method, headers };
  if (request.method !== "GET" && request.method !== "HEAD") init.body = await request.arrayBuffer();
  const res = await fetcher(target, init);
  const out = new Response(res.body, res);
  out.headers.set("cache-control", "no-store");
  return out;
}
