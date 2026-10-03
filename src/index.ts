/**
 * @xano-sdk/mcp-oauth - hosted OAuth sign-in for Xano SDK MCP servers.
 *
 * `registerMcpOauth(app, { authTable })` adds a sign-in and consent page and the
 * endpoints behind it, and returns the `oauth` block for `mcpServer()`.
 * `exportLoginPage` renders the same page for hosting on your own domain.
 */
export { createMcpOauth, registerMcpOauth } from "./register.js";
export type { McpOauthDefs } from "./register.js";
export { exportLoginPage } from "./page/export.js";
export type { ExportLoginPageOptions } from "./page/export.js";
export type { RenderedPage } from "./page/template.js";
export { DEFAULT_RATE_LIMIT, DEFAULT_LOGIN_URL_ENV } from "./options.js";
export type { McpOauthOptions, RateLimitOptions, BrandingOptions } from "./options.js";
export { SIGN_IN_TOKEN_SECONDS } from "./api/sign-in.js";
export { CONTRACT } from "./contract.js";
export type {
  McpOauthRequestParams,
  McpOauthRequestResponse,
  McpOauthSignInBody,
  McpOauthSignInResponse,
  McpOauthCompleteBody,
  McpOauthCompleteResponse,
} from "./api/client-types.js";
