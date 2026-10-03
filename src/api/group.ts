/**
 * The module's API group, minted per {@link createMcpOauth} call.
 *
 * Unlike most modules this one pins a canonical by default (see
 * `McpOauthOptions.canonical`): the login URL is an env value built from it.
 */
import { apiGroup } from "@xano/sdk";
import type { ResolvedMcpOauthOptions } from "../options.js";

export const createMcpOauthGroup = (options: ResolvedMcpOauthOptions) =>
  apiGroup({
    name: "MCP OAuth",
    description: "Sign-in and consent for this workspace's MCP servers. Registered by @xano-sdk/mcp-oauth.",
    canonical: options.canonical,
    // Off by default: `sign_in` carries a plaintext password and `complete` a
    // bearer token, and history stores request bodies.
    history: options.history,
  });
