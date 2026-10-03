/**
 * createMcpOauth / registerMcpOauth - build the def set, and install it.
 *
 * `registerMcpOauth(app, opts)` builds AND registers, and RETURNS the def set,
 * including the `oauth` block to pass to `mcpServer()`. That returned handle is
 * the consumer's only route to the registered defs.
 *
 * The WeakSet is not redundant with core's duplicate-def guard. Core compares
 * def IDENTITY, so two calls produce distinct def objects that share names,
 * slip past it, and fail at `export()` naming neither call site. The guard
 * turns that into a sentence naming this function - and enforces one instance
 * per workspace, which is all 1.x supports.
 */
import type { McpOauthHosted, Xano } from "@xano/sdk";
import { resolveOptions, type McpOauthOptions } from "./options.js";
import { createMcpOauthGroup } from "./api/group.js";
import { createLoginPageQuery } from "./api/login-page.js";
import { createRequestQuery } from "./api/request.js";
import { createSignInQuery } from "./api/sign-in.js";
import { createCompleteQuery } from "./api/complete.js";

const installed = new WeakSet<Xano>();

/** Everything one createMcpOauth() call minted. */
export interface McpOauthDefs {
  group: ReturnType<typeof createMcpOauthGroup>;
  loginQuery: ReturnType<typeof createLoginPageQuery>;
  requestQuery: ReturnType<typeof createRequestQuery>;
  signInQuery: ReturnType<typeof createSignInQuery>;
  completeQuery: ReturnType<typeof createCompleteQuery>;
  /**
   * Pass verbatim to `mcpServer({ oauth })`. It names the same auth table the
   * endpoints use, which the platform requires; a hand-built block that names a
   * different one fails every sign-in at the last step.
   */
  oauth: McpOauthHosted;
}

/**
 * Build the def set without registering it. Two calls are fully independent.
 *
 * Pass `canonical`: without a workspace to read a name from, the default
 * (`mcp-oauth-<workspace name>`) cannot be built. `registerMcpOauth` reads it
 * from the app it is given.
 */
export function createMcpOauth(options: McpOauthOptions, workspaceName?: string): McpOauthDefs {
  const resolved = resolveOptions(options, { workspaceName });
  const group = createMcpOauthGroup(resolved);
  return {
    group,
    loginQuery: createLoginPageQuery(group, resolved),
    requestQuery: createRequestQuery(group),
    signInQuery: createSignInQuery(group, resolved),
    completeQuery: createCompleteQuery(group, resolved),
    oauth: { mode: "hosted", authTable: resolved.authTable, loginUrl: resolved.loginUrl },
  };
}

/**
 * Build the def set, register it onto `app`, and hand it back.
 *
 * The consumer's auth table is NOT registered here. This module points at it;
 * registering someone else's table would make the two registrations collide.
 */
export function registerMcpOauth(app: Xano, options: McpOauthOptions): McpOauthDefs {
  if (installed.has(app)) {
    throw new Error(
      "registerMcpOauth: already installed on this Xano instance. One instance serves every MCP server on " +
        "its auth table; a second call registers a second def set with the same names, which fails at " +
        "export() naming neither call site. Call it once and pass the returned `oauth` to each server.",
    );
  }
  const name = (app.workspaceSettings() as { name?: unknown }).name;
  const defs = createMcpOauth(options, typeof name === "string" ? name : undefined);
  app
    .registerApiGroups([defs.group])
    .registerQueries([defs.loginQuery, defs.requestQuery, defs.signInQuery, defs.completeQuery]);
  installed.add(app);
  return defs;
}
