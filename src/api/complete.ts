/**
 * POST `mcp_oauth/complete` - hand the user's decision to the platform and get
 * back the single-use URL the page sends the browser to.
 *
 * `auth` is the consumer's auth table, which must be the MCP server's
 * `oauth.authTable`: the platform signs in the caller this endpoint accepted,
 * and refuses a session from any other table. `unsafe_user_id` is never used -
 * it would skip the platform's own table and session checks.
 */
import { query, s, ref, inp, input, type ApiGroupDef } from "@xano/sdk";
import type { ResolvedMcpOauthOptions } from "../options.js";

export const createCompleteQuery = (group: ApiGroupDef, options: ResolvedMcpOauthOptions) =>
  query({
    name: "mcp_oauth/complete",
    verb: "POST",
    apiGroup: group,
    auth: options.authTable,
    description: "Approve or deny a pending MCP sign-in as the signed-in user; returns the URL to continue at.",
    input: {
      mcp_request: input.text({ required: true }),
      decision: input.enum(["approve", "deny"], { required: true }),
    },
    stack: [s.mcp.oauth.complete({ request: inp("mcp_request"), decision: inp("decision"), as: "continue_url" })],
    response: { continue_url: ref("continue_url") },
  });
