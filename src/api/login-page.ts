/**
 * GET `mcp_oauth/login` - the sign-in and consent page, served by the backend
 * itself, so there is no frontend to build or host.
 *
 * The platform redirects a signing-in browser here with `?mcp_request=`. The
 * page is rendered once, at build time; this endpoint only sets its headers
 * and answers the string. A text response with a Content-Type already set is
 * printed verbatim, headers intact (verified live, AGENTS.md).
 *
 * `mcp_request` is declared optional on purpose: the page reports a missing
 * one itself, in words, rather than the engine answering a JSON 400.
 */
import { query, c, input, respond, type ApiGroupDef } from "@xano/sdk";
import type { ResolvedMcpOauthOptions } from "../options.js";
import { renderPage } from "../page/template.js";

export const createLoginPageQuery = (group: ApiGroupDef, options: ResolvedMcpOauthOptions) => {
  const { html, headers } = renderPage(options);
  return query({
    name: "mcp_oauth/login",
    verb: "GET",
    apiGroup: group,
    description: "The MCP sign-in and consent page. Point MCP_OAUTH_LOGIN_URL here.",
    input: { mcp_request: input.text() },
    stack: [
      respond.header("Content-Type", headers["Content-Type"]),
      respond.header("Content-Security-Policy", headers["Content-Security-Policy"]),
      respond.header("X-Frame-Options", headers["X-Frame-Options"]),
      respond.header("Referrer-Policy", headers["Referrer-Policy"]),
      respond.header("Cache-Control", headers["Cache-Control"]),
      respond.header("X-Content-Type-Options", headers["X-Content-Type-Options"]),
    ],
    response: c.text(html),
  });
};
