/**
 * Shared fixtures and bundle introspection.
 *
 * The auth tables are declared once here so every test file sees the same
 * shapes. Guids are derived locally (`md5("<kind>:<name>")`, the SDK's lockless
 * fallback) rather than imported from `@xano/sdk/internal`: a module test that
 * reached into the SDK's internals would pass against a contract consumers
 * cannot see.
 */
import { createHash } from "node:crypto";
import { f, table, workspace } from "@xano/sdk";
import { registerMcpOauth } from "../src/index.js";
import type { McpOauthOptions } from "../src/index.js";

export const testAuthTable = table({
  name: "user",
  auth: true,
  schema: {
    email: f.email({ required: true }),
    password: f.password({ required: true }),
    active: f.bool(),
    nickname: f.text(),
  },
  index: [{ type: "unique", fields: [{ name: "email" }] }],
});

export const renamedColumnAuthTable = table({
  name: "member",
  auth: true,
  schema: {
    login: f.email({ required: true }),
    secret: f.password({ required: true }),
  },
});

export const deriveGuid = (kind: string, name: string): string => createHash("md5").update(`${kind}:${name}`).digest("hex");

export const baseOptions: McpOauthOptions = { authTable: testAuthTable };

/** Register the module on a fresh workspace and export it. */
export function exportWithModule(overrides: Partial<McpOauthOptions> = {}, name = "test-app") {
  const app = workspace(name).registerTables([testAuthTable]);
  const defs = registerMcpOauth(app, { ...baseOptions, ...overrides });
  return { app, defs, bundle: app.export() as any };
}

export function queryIn(bundle: any, verb: string, name: string): any {
  const q = (bundle.payload?.query ?? []).find((x: any) => x.verb === verb && x.name === name);
  if (!q) throw new Error(`no ${verb} ${name} in bundle`);
  return q;
}

/** Every stack node (recursively) whose `name` matches. */
export function statementsNamed(obj: any, name: string): any[] {
  const out: any[] = [];
  const walk = (n: any) => {
    if (Array.isArray(n)) n.forEach(walk);
    else if (n && typeof n === "object") {
      if (n.name === name) out.push(n);
      Object.values(n).forEach(walk);
    }
  };
  walk(obj);
  return out;
}
