import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as mod from "../src/index.js";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  xanosdk?: { register: string; returns: string; options: Record<string, unknown> };
};

describe("package.json xanosdk block (what `init --marketplace` wires from)", () => {
  it("names a real register export that returns a handle", () => {
    expect(pkg.xanosdk?.register).toBe("registerMcpOauth");
    expect(typeof (mod as Record<string, unknown>)[pkg.xanosdk!.register]).toBe("function");
    expect(pkg.xanosdk?.returns).toBe("handle");
  });

  it("supplies only authTable, from @xano-sdk/auth's userTable", () => {
    expect(pkg.xanosdk?.options).toEqual({ authTable: { package: "@xano-sdk/auth", export: "userTable" } });
  });
});
