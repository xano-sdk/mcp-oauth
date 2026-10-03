/**
 * The install contract: one call puts everything on the workspace, returns the
 * oauth block for mcpServer(), and a second call on the same app is refused HERE.
 */
import { describe, expect, it } from "vitest";
import { Xano, env, mcpServer, tool, s, c, workspace } from "@xano/sdk";
import { createMcpOauth, registerMcpOauth } from "../src/index.js";
import { renderPage } from "../src/page/template.js";
import { resolveOptions } from "../src/options.js";
import { baseOptions, deriveGuid, exportWithModule, queryIn, statementsNamed, testAuthTable } from "./helpers.js";

describe("registerMcpOauth", () => {
  it("registers the group and all four endpoints in one call", () => {
    const { bundle } = exportWithModule();
    expect(bundle.payload.app).toHaveLength(1);
    expect(bundle.payload.query.map((q: any) => `${q.verb} ${q.name}`).sort()).toEqual([
      "GET mcp_oauth/login",
      "GET mcp_oauth/request",
      "POST mcp_oauth/complete",
      "POST mcp_oauth/sign_in",
    ]);
  });

  it("returns an oauth block naming the passed table and the env login URL by default", () => {
    const { defs } = exportWithModule();
    expect(defs.oauth).toEqual({ mode: "hosted", authTable: testAuthTable, loginUrl: env("MCP_OAUTH_LOGIN_URL") });
    expect(exportWithModule({ loginUrl: "https://login.acme.com/" }).defs.oauth.loginUrl).toBe("https://login.acme.com/");
  });

  it("builds the default canonical from the workspace name, so the login path is known before deploy", () => {
    const { defs, bundle } = exportWithModule({}, "Acme Notes");
    expect(bundle.payload.app[0].canonical).toBe("mcp-oauth-acme-notes");
    expect(defs.loginQuery.getPath()).toBe("/api:mcp-oauth-acme-notes/mcp_oauth/login");
  });

  it("asks for a canonical when the app has no workspace name", () => {
    expect(() => registerMcpOauth(new Xano(), baseOptions)).toThrow(/pass `canonical`/);
    expect(() => registerMcpOauth(new Xano(), { ...baseOptions, canonical: "signin" })).not.toThrow();
  });

  it("does NOT register the consumer's auth table", () => {
    const app = workspace("solo");
    registerMcpOauth(app, baseOptions);
    expect(() => app.export()).toThrow(/user.*not registered/s);
  });

  it("refuses a second install on the same app, by name", () => {
    const app = workspace("twice").registerTables([testAuthTable]);
    registerMcpOauth(app, baseOptions);
    expect(() => registerMcpOauth(app, baseOptions)).toThrow(/registerMcpOauth: already installed/);
  });

  it("wires into mcpServer: the stored block names the same table the endpoints use", () => {
    const app = workspace("wired").registerTables([testAuthTable]);
    const defs = registerMcpOauth(app, baseOptions);
    const ping = tool({ name: "ping", description: "ping", stack: [s.set_var("x", c.int(1))], response: { ok: c.bool(true) } });
    const server = mcpServer({ name: "notes", canonical: "notes-mcp", tools: [ping], oauth: defs.oauth });
    app.registerTools([ping]).registerMcpServers([server]);
    const bundle = app.export() as any;
    const stored = bundle.payload.toolset.find((t: any) => t.name === "notes").oauth;
    expect(stored).toMatchObject({ mode: "hosted", login_url: "${env.MCP_OAUTH_LOGIN_URL}" });
    expect(stored.auth_table).toBe(deriveGuid("dbo", "user"));
    expect(queryIn(bundle, "POST", "mcp_oauth/complete").auth).toBe(stored.auth_table);
    expect(JSON.stringify(bundle.diagnostics ?? [])).not.toContain("mcp.oauth-hosted-incomplete");
  });

  it("createMcpOauth builds two independent def sets", () => {
    const a = createMcpOauth({ ...baseOptions, canonical: "a" });
    const b = createMcpOauth({ ...baseOptions, canonical: "b" });
    expect(a.group).not.toBe(b.group);
    expect(a.loginQuery).not.toBe(b.loginQuery);
  });
});

describe("GET mcp_oauth/login", () => {
  const q = queryIn(exportWithModule({ brandName: "Acme" }).bundle, "GET", "mcp_oauth/login");
  const page = renderPage(resolveOptions({ ...baseOptions, brandName: "Acme" }, { workspaceName: "test-app" }));

  it("serves the endpoint-mode render as a single text response", () => {
    expect(q.result).toEqual([expect.objectContaining({ name: "", tag: "const", value: page.html })]);
    expect(q.auth).toBe(false);
  });

  it("sets every page header", () => {
    const lines = statementsNamed(q, "mvp:setheader").map((h: any) => h.context.value);
    for (const [name, value] of Object.entries(page.headers)) expect(lines).toContain(`${name}: ${value}`);
  });

  it("takes mcp_request as an optional input, so the page can report a missing one", () => {
    expect(q.input).toEqual([expect.objectContaining({ name: "mcp_request", required: false })]);
  });
});
