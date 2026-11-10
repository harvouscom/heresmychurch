import { afterEach, describe, expect, it, vi } from "vitest";
import { rewriteForBots } from "../og-rewrite";
import { churchSchema, schemaJson } from "../../shared/church-profile";
import { readFileSync } from "node:fs";
const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const church = { id: "IA-123", shortId: "12345678", name: "Hope Church", city: "Des Moines", state: "IA", country: "US", address: "10 Main St", lat: 41.5, lng: -93.6, website: "https://example.org", phone: "5155550100", email: "hello@example.org", denomination: "Baptist", serviceTimes: "Sunday 9am; Wednesday 7pm", attendance: 100, languages: ["English"], ministries: ["Youth"], lastVerified: Date.UTC(2026, 0, 1) };
const next = async () => new Response(html, { headers: { "content-type": "text/html", etag: "old", "content-length": String(html.length) } });
const render = (path = "/US/IA/12345678", ua = "Mozilla/5.0") => rewriteForBots(new Request(`https://heresmychurch.com${path}`, { headers: { "user-agent": ua } }), next);
const ld = (text: string) => JSON.parse(text.match(/<script id="church-jsonld" type="application\/ld\+json">(.*?)<\/script>/s)![1]);
afterEach(() => vi.unstubAllGlobals());
describe("initial church profiles", () => {
  it("delivers identical full facts and schema to browsers, Google, and AI crawlers", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ church })));
    const pages = await Promise.all(["Mozilla/5.0", "Googlebot", "OAI-SearchBot"].map(async ua => (await render(undefined, ua)).text()));
    expect(pages[0]).toBe(pages[1]); expect(pages[1]).toBe(pages[2]);
    for (const fact of ["Sunday 9am", "5155550100", "hello@example.org", "English", "Youth", "2026-01-01", "estimate"]) expect(pages[0]).toContain(fact);
    expect(pages[0]).toContain("Hope Church in Des Moines, Iowa");
    const data = ld(pages[0]); expect(data["@graph"][0]).toMatchObject({ "@type": "Church", telephone: church.phone, address: { addressCountry: "US" } });
    expect(data["@graph"][0]).not.toHaveProperty("openingHours");
    expect(data["@graph"][2].itemListElement).toHaveLength(4);
  });
  it("uses Canadian geography and contacts without inventing missing information", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ church: { name: "Toronto Church", shortId: "12345678", state: "ON", country: "CA" } })));
    const text = await (await render("/CA/ON/12345678")).text();
    expect(text).toContain("Ontario, Canada"); expect(text).toContain("Service times have not been listed");
    const entity = ld(text)["@graph"][0]; expect(entity.address.addressCountry).toBe("CA"); expect(entity).not.toHaveProperty("geo"); expect(entity).not.toHaveProperty("telephone");
  });
  it("escapes community text in HTML and JSON-LD, including replacement tokens", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ church: { ...church, name: 'Test $& </script><img src=x onerror=alert(1)>', website: "javascript:alert(1)" } })));
    const text = await (await render()).text(); expect(text).not.toContain("<img src=x"); expect(text).not.toContain('href="javascript:');
    expect(ld(text)["@graph"][0].name).toContain("$& </script>");
    expect(text).toContain("Test $&amp; &lt;/script&gt;");
  });
  it("permanently redirects legacy IDs and trailing slashes to the numeric canonical", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ church })));
    for (const path of ["/US/IA/IA-123", "/US/IA/12345678/"]) {
      const res = await render(path); expect(res.status).toBe(301); expect(res.headers.get("location")).toBe("https://heresmychurch.com/US/IA/12345678");
    }
  });
  it("returns noindex 404 for missing profiles and rejects the wrong country", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    const res = await render(); expect(res.status).toBe(404); expect(await res.text()).toContain('name="robots" content="noindex"');
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ church: { ...church, country: "CA" } })));
    expect((await render()).status).toBe(404);
    expect((await render("/CA/IA/12345678")).status).toBe(404);
  });
  it("keeps temporary failures retryable instead of indexing empty listings", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    const res = await render(); expect(res.status).toBe(503); expect(res.headers.get("retry-after")).toBe("60");
  });
  it("provides the same facts as Markdown with a canonical HTML citation", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ church })));
    const res = await render("/US/IA/12345678.md");
    expect(res.headers.get("content-type")).toContain("text/markdown");
    expect(res.headers.get("link")).toContain('<https://heresmychurch.com/US/IA/12345678>; rel="canonical"');
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    const text = await res.text(); expect(text).toContain(church.serviceTimes); expect(text).toContain(church.phone);
    expect(text).toContain("2026-01-01"); expect(text).not.toContain("<script");
    const redirect = await render("/US/IA/IA-123.md"); expect(redirect.headers.get("location")).toBe("https://heresmychurch.com/US/IA/12345678.md");
  });
  it("removes stale body validators after rewriting", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ church })));
    const res = await render(); expect(res.headers.has("etag")).toBe(false); expect(res.headers.has("content-length")).toBe(false);
  });
  it("omits unsafe websites and invalid coordinates and safely serializes scripts", () => {
    const data = churchSchema({ ...church, lat: 100, website: "data:text/html,hi" }, { cc: "US", region: "IA", regionName: "Iowa", countryName: "United States", url: "https://heresmychurch.com/US/IA/12345678" });
    expect((data["@graph"] as any[])[0]).not.toHaveProperty("geo"); expect((data["@graph"] as any[])[0]).not.toHaveProperty("sameAs");
    expect(schemaJson({ name: "</script>" })).not.toContain("</script>");
  });
});
