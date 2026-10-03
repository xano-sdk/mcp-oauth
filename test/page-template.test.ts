import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { escapeHtml, renderPage } from "../src/page/template.js";
import { PAGE_SCRIPT } from "../src/page/script.js";
import { BASE_STYLES } from "../src/page/styles.js";

const BRANDING = { brandName: undefined, brandColor: "#18181b", brandLogoUrl: undefined, sharedDomainNotice: true };

const between = (html: string, open: string, close: string) => html.split(open)[1]!.split(close)[0]!;
const hash = (s: string) => `'sha256-${createHash("sha256").update(s, "utf8").digest("base64")}'`;
const csp = (headers: { "Content-Security-Policy": string }) => headers["Content-Security-Policy"];
const directive = (policy: string, name: string) => policy.split("; ").find((d) => d.startsWith(`${name} `));

describe("renderPage", () => {
  it("escapes the brand name, ampersand first", () => {
    const { html } = renderPage({ ...BRANDING, brandName: `<script>x</script> & "Co" &amp;` });
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt; &amp; &quot;Co&quot; &amp;amp;");
    expect(escapeHtml("&<")).toBe("&amp;&lt;");
  });

  it("leaves the brand block out entirely when nothing is set", () => {
    expect(renderPage(BRANDING).html).not.toContain('class="brand"');
    expect(renderPage({ ...BRANDING, brandName: "Acme" }).html).toContain('<header class="brand"><span>Acme</span></header>');
  });

  it("renders a complete document", () => {
    const { html } = renderPage(BRANDING);
    expect(html.startsWith("<!doctype html>\n<html lang=\"en\">")).toBe(true);
    expect(html.trimEnd().endsWith("</html>")).toBe(true);
    expect(html).toContain('<meta name="viewport"');
    expect(html).toContain("<noscript>");
  });

  it("is LF-only, because browsers hash inline content after newline normalization", () => {
    expect(renderPage({ ...BRANDING, brandName: "Acme", brandLogoUrl: "https://cdn.acme.com/l.png" }).html).not.toContain("\r");
    expect(PAGE_SCRIPT).not.toContain("\r");
    expect(BASE_STYLES).not.toContain("\r");
  });

  it("hashes the script and the style exactly as emitted", () => {
    const { html, headers } = renderPage({ ...BRANDING, brandColor: "#0055ff" });
    expect(directive(csp(headers), "script-src")).toBe(`script-src ${hash(between(html, "<script>", "</script>"))}`);
    expect(directive(csp(headers), "style-src")).toBe(`style-src ${hash(between(html, "<style>", "</style>"))}`);
    expect(between(html, "<style>", "</style>")).toContain("--accent: #0055ff;");
  });

  it("emits the identical script whatever the branding or mode", () => {
    const a = renderPage(BRANDING).html;
    const b = renderPage({ ...BRANDING, brandName: "Other", brandColor: "#123456", sharedDomainNotice: false }, "https://h.example/api:x").html;
    expect(between(a, "<script>", "</script>")).toBe(between(b, "<script>", "</script>"));
    expect(between(a, "<script>", "</script>")).toBe(PAGE_SCRIPT);
  });

  it("locks the policy down in both modes", () => {
    for (const base of [undefined, "https://h.example/api:x"]) {
      const policy = csp(renderPage(BRANDING, base).headers);
      expect(policy.split("; ")).toEqual(
        expect.arrayContaining(["default-src 'none'", "form-action 'none'", "base-uri 'none'", "frame-ancestors 'none'"]),
      );
      expect(policy).not.toContain("unsafe-inline");
    }
  });

  it("allows connections to itself when endpoint-served and to the API origin when exported", () => {
    expect(directive(csp(renderPage(BRANDING).headers), "connect-src")).toBe("connect-src 'self'");
    expect(directive(csp(renderPage(BRANDING, "https://api.acme.com/tenant/t/api:x").headers), "connect-src")).toBe(
      "connect-src https://api.acme.com",
    );
  });

  it("lists exactly the logo origin plus https: for images, never a wildcard or data:", () => {
    expect(directive(csp(renderPage(BRANDING).headers), "img-src")).toBe("img-src https:");
    const withLogo = csp(renderPage({ ...BRANDING, brandLogoUrl: "https://cdn.acme.com/brand/logo.png" }).headers);
    expect(directive(withLogo, "img-src")).toBe("img-src https://cdn.acme.com https:");
    expect(withLogo).not.toMatch(/\*|data:/);
  });

  it("sends the framing, referrer, cache and sniffing headers", () => {
    const { headers } = renderPage(BRANDING);
    expect(headers).toMatchObject({
      "Content-Type": "text/html; charset=utf-8",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
  });

  it("posts nowhere: the form is method=post and nothing could serialize into the page URL", () => {
    const { html } = renderPage(BRANDING);
    expect(html).toContain('<form id="signin" method="post" action="#"');
    expect(html).toContain('autocomplete="username"');
    expect(html).toContain('autocomplete="current-password"');
  });

  it("carries per-page data on the body, empty API base when endpoint-served", () => {
    expect(renderPage(BRANDING).html).toMatch(/<body data-api-base="" data-contract="\d+" data-notice="1">/);
    expect(renderPage({ ...BRANDING, sharedDomainNotice: false }, "https://h.example/api:x").html).toContain(
      'data-api-base="https://h.example/api:x"',
    );
  });

  it("adds a meta CSP only to the exported page, without frame-ancestors", () => {
    expect(renderPage(BRANDING).html).not.toContain('http-equiv="Content-Security-Policy"');
    const meta = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(renderPage(BRANDING, "https://h.example/api:x").html)?.[1];
    expect(meta).toBeDefined();
    expect(meta).not.toContain("frame-ancestors");
    expect(meta).toContain("connect-src https://h.example");
  });
});
