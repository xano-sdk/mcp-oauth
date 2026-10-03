import { describe, expect, it } from "vitest";
import { env, f, table } from "@xano/sdk";
import { userTable } from "./fixtures/auth-user-table.js";
import { DEFAULT_RATE_LIMIT, resolveOptions } from "../src/options.js";
import type { McpOauthOptions } from "../src/options.js";
import { renamedColumnAuthTable, testAuthTable } from "./helpers.js";

const resolve = (o: Partial<McpOauthOptions> = {}, workspaceName: string | undefined = "test-app") =>
  resolveOptions({ authTable: testAuthTable, ...o } as McpOauthOptions, { workspaceName });

describe("resolveOptions — defaults", () => {
  it("applies every default when only authTable is passed", () => {
    const r = resolve();
    expect(r.emailColumn).toBe("email");
    expect(r.passwordColumn).toBe("password");
    expect(r.activeColumn).toBeUndefined();
    expect(r.loginUrl).toEqual(env("MCP_OAUTH_LOGIN_URL"));
    expect(r.canonical).toBe("mcp-oauth-test-app");
    expect(r.brandName).toBeUndefined();
    expect(r.brandColor).toBe("#2563eb");
    expect(r.brandLogoUrl).toBeUndefined();
    expect(r.sharedDomainNotice).toBe(true);
    expect(r.rateLimit).toEqual(DEFAULT_RATE_LIMIT);
    expect(r.history).toBe(false);
  });

  it("keeps the per-email window inside the ten-minute flow", () => {
    expect(DEFAULT_RATE_LIMIT.ttl).toBeLessThanOrEqual(600);
  });

  it("slugs the workspace name into the default canonical", () => {
    expect(resolve({}, "My App").canonical).toBe("mcp-oauth-my-app");
    expect(resolve({}, "  Acme & Co.  ").canonical).toBe("mcp-oauth-acme-co");
  });

  it("keeps a valid custom canonical", () => {
    expect(resolve({ canonical: "acme_signin-2" }).canonical).toBe("acme_signin-2");
  });

  it("refuses to guess a canonical when there is no workspace name", () => {
    expect(() => resolveOptions({ authTable: testAuthTable }, { workspaceName: undefined })).toThrow(/`canonical`/);
  });

  it("accepts @xano-sdk/auth's userTable, whose schema declares no created_at", () => {
    expect(() => resolveOptions({ authTable: userTable }, { workspaceName: "app" })).not.toThrow();
  });
});

describe("resolveOptions — refusals", () => {
  it("refuses a missing authTable by name", () => {
    expect(() => resolve({ authTable: undefined as never })).toThrow(/registerMcpOauth: `authTable` is required/);
  });

  it("refuses an emailColumn the table lacks", () => {
    expect(() => resolve({ emailColumn: "mail" })).toThrow(/`emailColumn` "mail" is not a column/);
  });

  it("reports two wrong columns together", () => {
    expect(() => resolve({ emailColumn: "mail", passwordColumn: "pw" })).toThrow(
      /`emailColumn` "mail" and `passwordColumn` "pw" are not columns/,
    );
  });

  it("accepts renamed columns that exist", () => {
    expect(() => resolve({ authTable: renamedColumnAuthTable, emailColumn: "login", passwordColumn: "secret" })).not.toThrow();
  });

  it("refuses a password column that is not f.password()", () => {
    expect(() => resolve({ passwordColumn: "nickname" })).toThrow(/is an `f\.text\(\)` column, not `f\.password\(\)`/);
  });

  it("refuses a system:false table that declares no created_at", () => {
    const bare = table({
      name: "bare_user",
      auth: true,
      system: false,
      schema: { id: f.int(), email: f.email(), password: f.password() },
      index: [{ type: "primary", fields: [{ name: "id" }] }],
    } as never);
    expect(() => resolve({ authTable: bare })).toThrow(/created_at/);
  });

  it("refuses an activeColumn that is missing", () => {
    expect(() => resolve({ activeColumn: "enabled" })).toThrow(/`activeColumn` "enabled" is not a column/);
  });

  it("refuses an activeColumn that is not boolean", () => {
    expect(() => resolve({ activeColumn: "nickname" })).toThrow(/`activeColumn` "nickname" is an `f\.text\(\)` column/);
  });

  it("accepts a boolean activeColumn", () => {
    expect(resolve({ activeColumn: "active" }).activeColumn).toBe("active");
  });

  it("refuses a non-hex brandColor and accepts #abc / #aabbcc", () => {
    expect(() => resolve({ brandColor: "red" })).toThrow(/`brandColor` "red" is not a hex colour/);
    expect(resolve({ brandColor: "#abc" }).brandColor).toBe("#abc");
    expect(resolve({ brandColor: "#aabbcc" }).brandColor).toBe("#aabbcc");
  });

  it.each(["http://cdn.example.com/logo.png", "javascript:alert(1)", "data:image/png;base64,AAAA", "not a url"])(
    "refuses brandLogoUrl %s",
    (url) => {
      expect(() => resolve({ brandLogoUrl: url })).toThrow(/`brandLogoUrl`/);
    },
  );

  it("accepts an https brandLogoUrl", () => {
    expect(resolve({ brandLogoUrl: "https://cdn.example.com/logo.png" }).brandLogoUrl).toBe("https://cdn.example.com/logo.png");
  });

  it("refuses a canonical with a space", () => {
    expect(() => resolve({ canonical: "has space" })).toThrow(/`canonical` "has space"/);
  });

  it("refuses a loginUrl that is not a URL, accepts https and env()", () => {
    expect(() => resolve({ loginUrl: "login page" })).toThrow(/`loginUrl`/);
    expect(() => resolve({ loginUrl: "ftp://example.com/x" })).toThrow(/`loginUrl`/);
    expect(resolve({ loginUrl: "https://login.example.com/" }).loginUrl).toBe("https://login.example.com/");
    expect(resolve({ loginUrl: env("MY_LOGIN") }).loginUrl).toEqual(env("MY_LOGIN"));
  });

  it.each([{ max: 1.5, ttl: 60 }, { max: 5 }, { max: 5, ttl: Number.NaN }, "x", null])("refuses rateLimit %j", (rateLimit) => {
    expect(() => resolve({ rateLimit: rateLimit as never })).toThrow(/`rateLimit` must be/);
  });

  it("refuses rateLimit with max 0 and accepts false", () => {
    expect(() => resolve({ rateLimit: { max: 0, ttl: 60 } })).toThrow(/`rateLimit`/);
    expect(resolve({ rateLimit: false }).rateLimit).toBe(false);
  });

  it("refuses a non-boolean history", () => {
    expect(() => resolve({ history: "yes" as never })).toThrow(/`history` must be a boolean/);
    expect(resolve({ history: true }).history).toBe(true);
  });

  it("refuses a non-boolean sharedDomainNotice", () => {
    expect(() => resolve({ sharedDomainNotice: "no" as never })).toThrow(/`sharedDomainNotice` must be a boolean/);
    expect(resolve({ sharedDomainNotice: false }).sharedDomainNotice).toBe(false);
  });

  it("refuses an empty brandName", () => {
    expect(() => resolve({ brandName: "  " })).toThrow(/`brandName`/);
  });
});
