import { describe, expect, it } from "vitest";
import { exportLoginPage } from "../src/page/export.js";
import { PAGE_SCRIPT } from "../src/page/script.js";

describe("exportLoginPage", () => {
  it("renders the page with the API base baked in and the headers to serve it with", () => {
    const { html, headers } = exportLoginPage({ apiBaseUrl: "https://x.xano.io/api:mcp-oauth-acme", brandName: "Acme" });
    expect(html).toContain('data-api-base="https://x.xano.io/api:mcp-oauth-acme"');
    expect(html).toContain("<span>Acme</span>");
    expect(html).toContain(PAGE_SCRIPT);
    expect(headers["Content-Security-Policy"]).toContain("connect-src https://x.xano.io");
    expect(headers["X-Frame-Options"]).toBe("DENY");
  });

  it("keeps a tenant path and drops a trailing slash", () => {
    const { html } = exportLoginPage({ apiBaseUrl: "https://x.xano.io/tenant/acme/api:mcp-oauth-acme/" });
    expect(html).toContain('data-api-base="https://x.xano.io/tenant/acme/api:mcp-oauth-acme"');
  });

  it.each([
    ["http://x.xano.io/api:a", /must be https/],
    ["not a url", /not an absolute URL/],
    ["https://x.xano.io/api:a?x=1", /query string/],
    ["https://x.xano.io/somewhere", /api:<canonical>/],
    ["", /required/],
  ])("refuses apiBaseUrl %s", (apiBaseUrl, message) => {
    expect(() => exportLoginPage({ apiBaseUrl })).toThrow(message);
  });

  it("validates branding with the same rules, reporting as itself", () => {
    expect(() => exportLoginPage({ apiBaseUrl: "https://x.xano.io/api:a", brandColor: "red" })).toThrow(
      /^exportLoginPage: `brandColor` "red" is not a hex colour/,
    );
    expect(() => exportLoginPage({ apiBaseUrl: "https://x.xano.io/api:a", brandLogoUrl: "http://a/l.png" })).toThrow(/brandLogoUrl/);
  });
});
