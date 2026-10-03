/**
 * The single definition of how the golden bundle is built AND serialized.
 *
 * `test/bundle.test.ts` asserts it; `scripts/regen-golden.ts` writes it. Both
 * import from here, so the asserted fixture and the written one cannot drift.
 *
 * EVERY option is set, to a NON-default value: a tripwire only guards what it
 * encodes. `GOLDEN_COVERAGE` states what "every feature" means, and
 * `bundle.test.ts` asserts the config still hits all of it.
 */
import { Xano, table, f } from "@xano/sdk";
import { createMcpOauth } from "../src/index.js";
import type { McpOauthOptions } from "../src/index.js";

/** Fixed, so the derived identities - and so the bundle - are deterministic. */
export const GOLDEN_WORKSPACE_NAME = "xts-mcp-oauth-golden";

export const GOLDEN_FIXTURE_URL = new URL("./fixtures/golden-bundle.json", import.meta.url);

/** Declared here, not imported from helpers, so the fixture never moves because a test fixture was edited. */
const goldenAuthTable = table({
  name: "golden_member",
  auth: true,
  useXdo: false,
  schema: { login: f.email({ required: true }), secret: f.password({ required: true }), enabled: f.bool() },
  index: [{ type: "unique", fields: [{ name: "login" }] }],
});

export const GOLDEN_COVERAGE = {
  queries: ["GET mcp_oauth/login", "GET mcp_oauth/request", "POST mcp_oauth/complete", "POST mcp_oauth/sign_in"],
  /**
   * Every option but `authTable`, each at its NON-default value. `rateLimit:
   * false` cannot share a bundle with a live limiter and is asserted at encode
   * level in queries.test.ts instead - freezing the less safe configuration
   * into the golden would be the wrong way round.
   */
  options: [
    "emailColumn",
    "passwordColumn",
    "activeColumn",
    "loginUrl",
    "canonical",
    "brandName",
    "brandColor",
    "brandLogoUrl",
    "sharedDomainNotice",
    "rateLimit",
    "history",
  ],
} as const;

export const GOLDEN_OPTIONS = {
  emailColumn: "login",
  passwordColumn: "secret",
  activeColumn: "enabled",
  loginUrl: "https://login.golden.example.com/mcp",
  canonical: "golden-signin",
  // Carries characters that MUST be escaped, so the fixture freezes the escaping.
  brandName: "Golden & Co <Ltd>",
  brandColor: "#7c3aed",
  brandLogoUrl: "https://cdn.golden.example.com/logo.png",
  sharedDomainNotice: false,
  rateLimit: { max: 3, ttl: 120 },
  history: true,
} as const satisfies Omit<Required<McpOauthOptions>, "authTable">;

/** A fresh, fully-registered export. `Xano.export()` is deterministic. */
export const buildGoldenBundle = () => {
  const xano = new Xano().registerWorkspace({ name: GOLDEN_WORKSPACE_NAME });
  const defs = createMcpOauth({ authTable: goldenAuthTable, ...GOLDEN_OPTIONS });
  xano
    .registerTables([goldenAuthTable])
    .registerApiGroups([defs.group])
    .registerQueries([defs.loginQuery, defs.requestQuery, defs.signInQuery, defs.completeQuery]);
  return xano.export();
};

/** 2-space JSON with a trailing newline - the committed fixture's on-disk form. */
export const serializeGoldenBundle = (bundle: unknown): string => JSON.stringify(bundle, null, 2) + "\n";
