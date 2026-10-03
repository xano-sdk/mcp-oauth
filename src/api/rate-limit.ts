/**
 * The sign-in limiter.
 *
 * Returns ONE `Statement`, never a `Statement[]`: a helper returning an array
 * and spread into a query's `stack` collapses the tuple, and every `ref()` in
 * that stack resolves to `unknown`. Nothing in THIS repo fails when that
 * happens; the consumer's typecheck does.
 *
 * The default key part is `sys.remoteIp()`: `sign_in` is unauthenticated, so
 * `auth("id")` is null there and one bucket would be shared by every caller.
 * The `action` prefix keeps each bucket its own counter.
 */
import { s, c, sys, withFilters, fl, type Statement, type Value } from "@xano/sdk";
import type { RateLimitOptions } from "../options.js";

export const rateLimitStatement = (
  action: string,
  limit: RateLimitOptions | false,
  keyPart: Value = sys.remoteIp(),
): Statement =>
  s.redis.ratelimit({
    key: withFilters(c.text(`mcpoauth:${action}:`), fl.concat(keyPart)),
    max: c.int(limit === false ? 1 : limit.max),
    ttl: c.int(limit === false ? 1 : limit.ttl),
    error: c.text("Too many sign-in attempts. Wait a few minutes and try again."),
    // `rateLimit: false` keeps the step and turns it OFF rather than removing
    // it: the stack stays one literal tuple, and the disabled step is visible
    // in the Xano UI.
    ...(limit === false ? { disabled: true } : {}),
  });
