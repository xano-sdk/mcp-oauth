/**
 * POST `mcp_oauth/sign_in` - check an email and password against the auth
 * table and mint a short session for completing the sign-in.
 *
 * ⚠ The token is a real session on the auth table, valid for 600 seconds on
 * every endpoint whose `auth` is that table - not only `mcp_oauth/complete`.
 * Only `activeColumn` of the consumer's own login rules is applied here; the
 * README says so under "Read before production".
 *
 * Every refusal - unknown email, no password set, wrong password, inactive
 * user - answers the same `accessdenied` message, so the endpoint is not an
 * oracle for which addresses have accounts.
 */
import { query, s, c, ref, inp, input, expr, withFilters, fl, type ApiGroupDef } from "@xano/sdk";
import type { ResolvedMcpOauthOptions } from "../options.js";
import { rateLimitStatement } from "./rate-limit.js";

/**
 * The session's lifetime. `mcp_oauth/complete` only accepts a session under
 * ten minutes old, and a sign-in request itself dies ten minutes after the
 * client asked, so a longer token would buy nothing but exposure.
 */
export const SIGN_IN_TOKEN_SECONDS = 600;

const DENIED = "Invalid email or password.";

/**
 * A real hash in the engine's stored format, of a random password that was
 * discarded when it was minted (see AGENTS.md, live facts). Checked against
 * when there is no usable row, so a miss costs the same as a hit.
 */
/** The engine's stored hash format: a 16-hex salt, a dot, a 64-hex digest. */
const ENGINE_HASH_PATTERN = "^[0-9a-f]{16}\\.[0-9a-f]{64}$";

const DUMMY_HASH = "59ad7897a30e940d.76b7f3f4338d5c6f945dc98785cdbdaf9c7f3ed657c107164befd593ce227ac0";

export const createSignInQuery = (group: ApiGroupDef, options: ResolvedMcpOauthOptions) => {
  const passwordPath = `user.${options.passwordColumn}`;
  return query({
    name: "mcp_oauth/sign_in",
    verb: "POST",
    apiGroup: group,
    description: "Sign in with email and password; returns a 10-minute session for mcp_oauth/complete.",
    input: {
      // `methods` normalise at bind time, so the rate-limit key below sees the
      // trimmed, lower-cased address and "A@b.com " cannot buy a second bucket.
      email: input.email({ required: true, methods: ["trim", "lower"] }),
      // `input.text`, never `input.password`: a password INPUT is hashed on
      // bind, and the check below would then compare a hash against a hash.
      password: input.text({ required: true }),
    },
    // A literal tuple. Never build it with a helper returning Statement[] or a
    // conditional spread: every ref() would resolve to unknown in a consumer's
    // typecheck while this repo stays green.
    stack: [
      rateLimitStatement("sign_in-ip", options.rateLimit),
      rateLimitStatement("sign_in-email", options.rateLimit, inp("email")),
      s.db.get({
        table: options.authTable,
        fieldName: options.emailColumn,
        fieldValue: inp("email"),
        // `output` must name the password column: it is `internal`, and a
        // db.get leaves it out unless asked.
        output: ["id", options.passwordColumn, ...(options.activeColumn === undefined ? [] : [options.activeColumn])],
        as: "user",
      }),
      // The hash check runs on EVERY request - against the user's hash when
      // there is a usable one, else against a dummy - and every refusal is
      // decided after it. Returning early on a miss would answer an unknown
      // email measurably faster than a known one, which is an oracle for which
      // addresses have accounts. It also keeps a row with no password (an
      // invited user, a social-only account) away from the hash check, which
      // fails on it with a 500 that says the account exists.
      s.set_var("password_hash", c.text(DUMMY_HASH)),
      s.set_var("has_password", c.bool(false)),
      s.conditional({
        // `{ safe: true }`: db.get binds null on a miss, and this IS the guard.
        when: expr(ref("user", { safe: true }), "!=", c.null()),
        then: [
          s.conditional({
            when: expr(ref(passwordPath), "!=", c.null()),
            then: [
              // Only a hash in the engine's own format is checked. Any other
              // value (empty, or a hash imported from another system) makes
              // check_password fail with a 500 that says the account exists,
              // so it stays on the dummy path and is refused like a miss.
              s.conditional({
                when: expr(withFilters(c.regex(ENGINE_HASH_PATTERN), fl.regex_test(ref(passwordPath))), "=", c.bool(true)),
                then: [
                  s.update_var("password_hash", ref(passwordPath)),
                  s.update_var("has_password", c.bool(true)),
                ],
              }),
            ],
          }),
        ],
      }),
      s.security.check_password({
        text_password: inp("password"),
        hash_password: ref("password_hash"),
        as: "password_ok",
      }),
      s.precondition({ expr: expr(ref("user", { safe: true }), "!=", c.null()), error_type: "accessdenied", error: c.text(DENIED) }),
      // A match against the dummy never signs anyone in: a row without a usable
      // hash is refused here, whatever the check said - this does not rest on
      // the dummy's password staying unknown.
      s.precondition({ expr: expr(ref("has_password"), "=", c.bool(true)), error_type: "accessdenied", error: c.text(DENIED) }),
      s.precondition({ expr: expr(ref("password_ok"), "=", c.bool(true)), error_type: "accessdenied", error: c.text(DENIED) }),
      // The consumer's "disabled" switch. Without `activeColumn` the step is
      // kept but disabled, so the stack is one shape either way.
      s.precondition({
        expr: expr(ref(`user.${options.activeColumn ?? "id"}`), "=", c.bool(true)),
        error_type: "accessdenied",
        error: c.text(DENIED),
        ...(options.activeColumn === undefined ? { disabled: true } : {}),
      }),
      s.security.create_auth_token({
        table: options.authTable,
        id: ref("user.id"),
        extras: c.obj({}),
        expiration: c.int(SIGN_IN_TOKEN_SECONDS),
        as: "token",
      }),
    ],
    response: { token: ref("token") },
    // The minted token is invisible to the static walk.
    responseShape: {} as { token: string },
  });
};
