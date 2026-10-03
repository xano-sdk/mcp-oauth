import { describe, expect, it } from "vitest";
import { workspace } from "@xano/sdk";
import { resolveOptions } from "../src/options.js";
import type { McpOauthOptions } from "../src/options.js";
import { createMcpOauthGroup } from "../src/api/group.js";
import { createRequestQuery } from "../src/api/request.js";
import { createSignInQuery } from "../src/api/sign-in.js";
import { createCompleteQuery } from "../src/api/complete.js";
import { CONTRACT } from "../src/contract.js";
import { DEFAULT_RATE_LIMIT } from "../src/options.js";
import { deriveGuid, queryIn, renamedColumnAuthTable, statementsNamed, testAuthTable } from "./helpers.js";

function build(overrides: Partial<McpOauthOptions> = {}) {
  const r = resolveOptions({ authTable: testAuthTable, ...overrides }, { workspaceName: "test-app" });
  const g = createMcpOauthGroup(r);
  const app = workspace("test-app")
    .registerTables([overrides.authTable ?? testAuthTable])
    .registerApiGroups([g])
    .registerQueries([createRequestQuery(g), createSignInQuery(g, r), createCompleteQuery(g, r)]);
  return app.export() as any;
}

const inputNamed = (stmt: any, name: string) => stmt.input.find((i: any) => i.name === name);
const authTableGuid = deriveGuid("dbo", "user");

describe("GET mcp_oauth/request", () => {
  const q = queryIn(build(), "GET", "mcp_oauth/request");

  it("reads the pending request from the mcp_request input", () => {
    const [stmt] = statementsNamed(q, "mvp:mcp_oauth_request");
    expect(inputNamed(stmt, "request")).toMatchObject({ value: "mcp_request", tag: "input" });
    expect(q.input.map((i: any) => i.name)).toEqual(["mcp_request"]);
  });

  it("is public and carries no limiter", () => {
    expect(q.auth).toBe(false);
    expect(statementsNamed(q, "mvp:redis_ratelimit")).toHaveLength(0);
  });

  it("answers the contract the page checks", () => {
    const r = JSON.stringify(q.result);
    expect(r).toContain('"contract"');
    expect(r).toContain(`"value":"${CONTRACT}"`);
  });

  it("only copies the client logo when the client is verified", () => {
    const [cond] = statementsNamed(q, "mvp:conditional");
    expect(JSON.stringify(cond.context)).toContain("details.client_verified");
    const updates = statementsNamed(cond, "mvp:update_var");
    expect(JSON.stringify(updates)).toContain("details.client_logo");
    expect(JSON.stringify(q.result)).toContain('"client_logo"');
  });
});

describe("POST mcp_oauth/sign_in", () => {
  const q = queryIn(build(), "POST", "mcp_oauth/sign_in");

  it("looks the user up by the configured email column and reads the hash", () => {
    const [get] = statementsNamed(q, "mvp:dbo_getby");
    expect(JSON.stringify(get)).toContain('"email"');
    expect(JSON.stringify(get)).toContain('"password"');
  });

  it("reads renamed columns everywhere it touches the row", () => {
    const qr = queryIn(
      build({ authTable: renamedColumnAuthTable, emailColumn: "login", passwordColumn: "secret" }),
      "POST",
      "mcp_oauth/sign_in",
    );
    const [get] = statementsNamed(qr, "mvp:dbo_getby");
    const getText = JSON.stringify(get);
    expect(getText).toContain('"login"');
    expect(getText).toContain('"secret"');
    expect(getText).not.toContain('"email","tag":"const"');
    const [check] = statementsNamed(qr, "mvp:check_pass");
    expect(JSON.stringify(check)).toContain('"value":"password_hash","tag":"var"');
    expect(JSON.stringify(statementsNamed(qr, "mvp:update_var"))).toContain("user.secret");
    expect(JSON.stringify(qr)).not.toContain("user.password");
  });

  it("answers an inactive user with the same message as every other refusal", () => {
    const on = queryIn(build({ activeColumn: "active" }), "POST", "mcp_oauth/sign_in");
    const live = statementsNamed(on, "mvp:precondition").filter((p: any) => !p.disabled);
    expect(live).toHaveLength(4);
    expect(new Set(live.map((p: any) => `${p.context.error_type}:${p.context.error.value}`))).toEqual(
      new Set(["accessdenied:Invalid email or password."]),
    );
  });

  it("takes the password as text, never a password input that would be hashed on bind", () => {
    expect(q.input.find((i: any) => i.name === "password").type).toBe("text");
    expect(q.input.find((i: any) => i.name === "email").methods.map((m: any) => m.name)).toEqual(["trim", "lower"]);
  });

  it("mints a 600-second token on the consumer's auth table", () => {
    const [mint] = statementsNamed(q, "mvp:create_auth");
    expect(inputNamed(mint, "dbtable").value).toBe(authTableGuid);
    expect(inputNamed(mint, "expiration").value).toBe("600");
  });

  it("answers every refusal with the same accessdenied message", () => {
    const pre = statementsNamed(q, "mvp:precondition");
    const live = pre.filter((p: any) => !p.disabled);
    expect(live.length).toBeGreaterThanOrEqual(2);
    const messages = new Set(pre.map((p: any) => `${p.context.error_type}:${p.context.error.value}`));
    expect([...messages]).toEqual(["accessdenied:Invalid email or password."]);
  });

  it("checks a hash on every request, and refuses only after the check", () => {
    const order: string[] = JSON.stringify(q.run ?? q).match(/"mvp:(precondition|check_pass|set_var)"/g) ?? [];
    // set_var (dummy hash) → check_pass → every precondition: no refusal can
    // answer before the hash check, so a miss costs what a hit costs.
    expect(order.slice(0, 3)).toEqual(['"mvp:set_var"', '"mvp:set_var"', '"mvp:check_pass"']);
    expect(order.slice(3).every((n) => n === '"mvp:precondition"')).toBe(true);
    const [check] = statementsNamed(q, "mvp:check_pass");
    expect(JSON.stringify(check)).toContain('"value":"password_hash","tag":"var"');
  });

  it("starts from a dummy hash in the engine's format and only swaps in a usable one", () => {
    const [dummy] = statementsNamed(q, "mvp:set_var");
    expect(JSON.stringify(dummy)).toMatch(/[0-9a-f]{16}\.[0-9a-f]{64}/);
    const conds = statementsNamed(q, "mvp:conditional").map((c: any) => JSON.stringify(c.context));
    expect(conds.some((c: string) => c.includes('"operand":"user"'))).toBe(true);
    expect(conds.some((c: string) => c.includes('"operand":"user.password"') && c.includes('"const:null"'))).toBe(true);
    // Only an engine-format hash is swapped in: any other value would make the check 500.
    expect(conds.some((c: string) => c.includes('"name":"regex_test"') && c.includes('"operand":"user.password"'))).toBe(true);
    expect(JSON.stringify(statementsNamed(q, "mvp:conditional"))).toContain("/^[0-9a-f]{16}\\\\.[0-9a-f]{64}$/");
    expect(JSON.stringify(statementsNamed(q, "mvp:update_var"))).toContain("user.password");
  });

  it("refuses a row with no usable hash even if the dummy check passed", () => {
    const flags = statementsNamed(q, "mvp:update_var").map((u: any) => JSON.stringify(u));
    expect(flags.some((f: string) => f.includes("has_password") && f.includes('"const:bool"'))).toBe(true);
    const pre = statementsNamed(q, "mvp:precondition").filter((p: any) => !p.disabled).map((p: any) => JSON.stringify(p.context.expr));
    expect(pre.some((e: string) => e.includes('"operand":"has_password"'))).toBe(true);
  });

  it("keeps the active check disabled without activeColumn and live with it", () => {
    const activeCheck = (qq: any) =>
      statementsNamed(qq, "mvp:precondition").find((p: any) => JSON.stringify(p.context.expr).includes('"const:bool"') && !/password_ok|has_password/.test(JSON.stringify(p.context.expr)));
    expect(activeCheck(q).disabled).toBe(true);
    const on = queryIn(build({ activeColumn: "active" }), "POST", "mcp_oauth/sign_in");
    const live = activeCheck(on);
    expect(live.disabled).toBe(false);
    expect(JSON.stringify(live.context.expr)).toContain('"operand":"user.active"');
  });

  it("limits per IP and per normalized email", () => {
    const rl = statementsNamed(q, "mvp:redis_ratelimit");
    expect(rl).toHaveLength(2);
    expect(rl.map((s: any) => JSON.stringify(inputNamed(s, "key")))).toEqual([
      expect.stringContaining("$remote_ip"),
      expect.stringContaining('"value":"email","tag":"input"'),
    ]);
    expect(rl.every((s: any) => s.disabled === false)).toBe(true);
  });

  it("limits with the default max and ttl, and with a custom one", () => {
    const limits = (qq: any) =>
      statementsNamed(qq, "mvp:redis_ratelimit").map((r: any) => [inputNamed(r, "max").value, inputNamed(r, "ttl").value]);
    expect(limits(q)).toEqual([
      [String(DEFAULT_RATE_LIMIT.max), String(DEFAULT_RATE_LIMIT.ttl)],
      [String(DEFAULT_RATE_LIMIT.max), String(DEFAULT_RATE_LIMIT.ttl)],
    ]);
    const custom = queryIn(build({ rateLimit: { max: 9, ttl: 300 } }), "POST", "mcp_oauth/sign_in");
    expect(limits(custom)).toEqual([["9", "300"], ["9", "300"]]);
  });

  it("limits before it reads the row or checks the password", () => {
    const order: string[] = JSON.stringify(q.run).match(/"mvp:(redis_ratelimit|dbo_getby|check_pass)"/g) ?? [];
    expect(order).toEqual(['"mvp:redis_ratelimit"', '"mvp:redis_ratelimit"', '"mvp:dbo_getby"', '"mvp:check_pass"']);
  });

  it("keeps both limiters, disabled, with rateLimit: false", () => {
    const off = queryIn(build({ rateLimit: false }), "POST", "mcp_oauth/sign_in");
    const rl = statementsNamed(off, "mvp:redis_ratelimit");
    expect(rl).toHaveLength(2);
    expect(rl.every((s: any) => s.disabled === true)).toBe(true);
  });
});

describe("POST mcp_oauth/complete", () => {
  const q = queryIn(build(), "POST", "mcp_oauth/complete");

  it("requires a session on the consumer's auth table", () => {
    expect(q.auth).toBe(authTableGuid);
  });

  it("never passes unsafe_user_id, in any option combination", () => {
    for (const o of [{}, { activeColumn: "active" }, { rateLimit: false as const }, { history: true }]) {
      const qq = queryIn(build(o), "POST", "mcp_oauth/complete");
      const [stmt] = statementsNamed(qq, "mvp:mcp_oauth_complete");
      expect(inputNamed(stmt, "unsafe_user_id")).toBeUndefined();
    }
  });

  it("accepts only approve and deny", () => {
    expect(q.input.find((i: any) => i.name === "decision")).toMatchObject({ type: "enum", values: ["approve", "deny"], required: true });
  });

  it("carries no limiter", () => {
    expect(statementsNamed(q, "mvp:redis_ratelimit")).toHaveLength(0);
  });
});

describe("the group", () => {
  it("is history-off by default and every endpoint inherits it", () => {
    const b = build();
    expect(b.payload.app[0].history).toMatchObject({ inherit: false, query_enabled: false });
    for (const q of b.payload.query) expect(q.history.inherit).toBe(true);
  });

  it("turns history on with history: true", () => {
    expect(build({ history: true }).payload.app[0].history).toMatchObject({ query_enabled: true });
  });

  it("carries the default and a custom canonical", () => {
    expect(build().payload.app[0].canonical).toBe("mcp-oauth-test-app");
    expect(build({ canonical: "acme-signin" }).payload.app[0].canonical).toBe("acme-signin");
  });
});
