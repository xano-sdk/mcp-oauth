/**
 * The byte-stability contract: the exported bundle deep-equals the committed
 * fixture, RAW - no normalizer. Regenerating the fixture is a deliberate,
 * reviewed act, NEVER a way to make this go green.
 */
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { GOLDEN_COVERAGE, GOLDEN_OPTIONS, GOLDEN_FIXTURE_URL, buildGoldenBundle, serializeGoldenBundle } from "./golden.js";
import { PAGE_SCRIPT } from "../src/page/script.js";
import { sha256Source } from "../src/page/csp.js";

const goldenText = readFileSync(GOLDEN_FIXTURE_URL, "utf8");
const golden = JSON.parse(goldenText);
const OPTION_KEYS = [
  "emailColumn", "passwordColumn", "activeColumn", "loginUrl", "canonical", "brandName",
  "brandColor", "brandLogoUrl", "sharedDomainNotice", "rateLimit", "history",
];

describe("golden bundle", () => {
  it("deep-equals the committed fixture", () => {
    expect(buildGoldenBundle()).toEqual(golden);
  });

  it("exports deterministically", () => {
    expect(JSON.stringify(buildGoldenBundle())).toBe(JSON.stringify(buildGoldenBundle()));
  });

  it("is byte-for-byte what `npm run fixture:regen` writes", () => {
    expect(goldenText).toBe(serializeGoldenBundle(buildGoldenBundle()));
  });

  it("covers every route and every option", () => {
    const bundle = buildGoldenBundle() as any;
    const routes = bundle.payload.query.map((q: any) => `${q.verb} ${q.name}`);
    expect(routes.sort()).toEqual([...GOLDEN_COVERAGE.queries].sort());
    expect([...GOLDEN_COVERAGE.options].sort()).toEqual(Object.keys(GOLDEN_OPTIONS).sort());
    expect(Object.keys(GOLDEN_OPTIONS).sort()).toEqual([...OPTION_KEYS].sort());
  });

  it("freezes the non-default branches", () => {
    const bundle = buildGoldenBundle() as any;
    expect(bundle.payload.app[0].canonical).toBe("golden-signin");
    expect(bundle.payload.app[0].history).toMatchObject({ inherit: false, query_enabled: true });
    const login = bundle.payload.query.find((q: any) => q.name === "mcp_oauth/login");
    const html: string = login.result[0].value;
    expect(html).toContain("Golden &amp; Co &lt;Ltd&gt;");
    expect(html).toContain("--accent: #7c3aed;");
    expect(html).toContain('data-notice="0"');
    expect(html).toContain('src="https://cdn.golden.example.com/logo.png"');
    const csp = login.run.find((s: any) => s.context?.value?.startsWith("Content-Security-Policy:")).context.value;
    expect(csp).toContain("img-src https://cdn.golden.example.com https:");
    expect(csp).toContain(`script-src ${sha256Source(PAGE_SCRIPT)}`);
    const signIn = JSON.stringify(bundle.payload.query.find((q: any) => q.name === "mcp_oauth/sign_in"));
    expect(signIn).toContain('"operand":"user.enabled"');
    expect(signIn).toContain('"value":"3","tag":"const:int"');
  });

  it("pins no guid of its own", () => {
    for (const file of ["../src/index.ts", "../src/register.ts", "../src/api/group.ts"]) {
      expect(readFileSync(new URL(file, import.meta.url), "utf8")).not.toMatch(/guid:\s*"/);
    }
  });
});
