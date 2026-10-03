/**
 * The consumer-visible type surface - and the NEGATIVE: no endpoint's response
 * infers as `StackTupleWidened`. A helper returning `Statement[]` spread into a
 * stack, or a conditional spread, collapses the tuple; nothing else in this
 * repo fails when it does. Compile-time only, which is why `npm test` runs tsc.
 */
import { describe, it, expectTypeOf } from "vitest";
import type { McpOauthHosted, StackTupleWidened } from "@xano/sdk";
import type {
  McpOauthDefs,
  McpOauthRequestResponse,
  McpOauthSignInBody,
  McpOauthSignInResponse,
  McpOauthCompleteBody,
  McpOauthCompleteResponse,
} from "../src/index.js";

export type WidenedIn<T> = T extends StackTupleWidened
  ? true
  : T extends readonly (infer E)[]
    ? WidenedIn<E>
    : T extends object
      ? { [K in keyof T]-?: WidenedIn<T[K]> }[keyof T]
      : false;
export type ContainsWidened<T> = true extends WidenedIn<T> ? true : false;

describe("no endpoint's response is widened away", () => {
  it("request", () => {
    expectTypeOf<ContainsWidened<McpOauthRequestResponse>>().toEqualTypeOf<false>();
    expectTypeOf<McpOauthRequestResponse>().toHaveProperty("contract");
    expectTypeOf<McpOauthRequestResponse>().toHaveProperty("client_name");
  });

  it("sign_in", () => {
    expectTypeOf<ContainsWidened<McpOauthSignInResponse>>().toEqualTypeOf<false>();
    expectTypeOf<McpOauthSignInResponse>().toEqualTypeOf<{ token: string }>();
  });

  it("complete", () => {
    expectTypeOf<ContainsWidened<McpOauthCompleteResponse>>().toEqualTypeOf<false>();
    expectTypeOf<McpOauthCompleteResponse>().toHaveProperty("continue_url");
  });
});

describe("request bodies and the oauth block", () => {
  it("sign_in takes an email and a password", () => {
    expectTypeOf<McpOauthSignInBody>().toHaveProperty("email");
    expectTypeOf<McpOauthSignInBody>().toHaveProperty("password");
  });

  it("complete takes the request id and a decision", () => {
    expectTypeOf<McpOauthCompleteBody>().toHaveProperty("mcp_request");
    expectTypeOf<McpOauthCompleteBody>().toHaveProperty("decision");
  });

  it("the oauth block is the SDK's hosted block, so it drops into mcpServer()", () => {
    expectTypeOf<McpOauthDefs["oauth"]>().toEqualTypeOf<McpOauthHosted>();
  });
});
