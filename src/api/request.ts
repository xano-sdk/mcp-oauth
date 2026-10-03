/**
 * GET `mcp_oauth/request` - what a pending sign-in is asking for, for the page
 * to show before anyone signs in.
 *
 * Public on purpose: the page calls it on load, before sign-in, so a link that
 * expired or was already used stops there, before a password is typed. It reads
 * an unguessable, single-use id and does not consume it.
 *
 * This route and its `contract` field are frozen for 1.x (see src/contract.ts).
 */
import { query, s, c, ref, inp, input, expr, type ApiGroupDef } from "@xano/sdk";
import { CONTRACT } from "../contract.js";

export const createRequestQuery = (group: ApiGroupDef) =>
  query({
    name: "mcp_oauth/request",
    verb: "GET",
    apiGroup: group,
    description: "The verified details of a pending MCP sign-in: server, client, callback host, verified.",
    input: { mcp_request: input.text({ required: true }) },
    stack: [
      s.mcp.oauth.request({ request: inp("mcp_request"), as: "details" }),
      // An unverified client's logo is never shown: anyone can register a
      // client with any name and any logo, and a familiar logo is exactly what
      // makes a lookalike convincing.
      s.set_var("client_logo", c.text("")),
      s.conditional({
        when: expr(ref("details.client_verified"), "=", c.bool(true)),
        then: [s.update_var("client_logo", ref("details.client_logo"))],
      }),
    ],
    response: {
      server_name: ref("details.server_name"),
      client_name: ref("details.client_name"),
      client_logo: ref("client_logo"),
      callback_host: ref("details.callback_host"),
      client_verified: ref("details.client_verified"),
      contract: c.int(CONTRACT),
    },
  });
