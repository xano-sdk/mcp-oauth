/**
 * The per-endpoint request and response types a frontend imports.
 *
 * Purely type-level: `ReturnType<typeof …>` names the def a factory WOULD build
 * without building one, so importing these pulls no runtime into a browser bundle.
 */
import type { InferInput, InferResponse } from "@xano/sdk";
import type { createRequestQuery } from "./request.js";
import type { createSignInQuery } from "./sign-in.js";
import type { createCompleteQuery } from "./complete.js";

/** GET `mcp_oauth/request` query parameters. */
export type McpOauthRequestParams = InferInput<ReturnType<typeof createRequestQuery>>;
/** GET `mcp_oauth/request` response: server, client, callback host, verified, contract. */
export type McpOauthRequestResponse = InferResponse<ReturnType<typeof createRequestQuery>>;
/** POST `mcp_oauth/sign_in` body. */
export type McpOauthSignInBody = InferInput<ReturnType<typeof createSignInQuery>>;
/** POST `mcp_oauth/sign_in` response: `{ token }`, a 600-second session. */
export type McpOauthSignInResponse = InferResponse<ReturnType<typeof createSignInQuery>>;
/** POST `mcp_oauth/complete` body. */
export type McpOauthCompleteBody = InferInput<ReturnType<typeof createCompleteQuery>>;
/** POST `mcp_oauth/complete` response: `{ continue_url }`. */
export type McpOauthCompleteResponse = InferResponse<ReturnType<typeof createCompleteQuery>>;
