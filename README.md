# @xano-sdk/mcp-oauth

Sign-in for your Xano SDK MCP servers, in one register call. When Claude or another MCP client
connects, your users land on a branded sign-in and consent page, sign in with their email and
password, and choose Allow or Deny. From then on every tool, prompt and resource on the server runs
as that user (`auth()`).

The module adds the page, the three endpoints behind it, and the `oauth` block you pass to
`mcpServer()`. The platform remains the OAuth authorization server: client registration, PKCE,
codes and tokens are all its job. This module is the page it sends people to.

There is no runtime: every export is a typed def object, and your `Xano` instance does all encoding
at `export()`.

**Hosted mode only.** If your users sign in through Auth0, Clerk, WorkOS, Entra, Okta or Cognito,
you don't need this: use `mcpServer({ oauth: { mode: "external", ... } })` and your provider's own
pages.

## Install

```bash
npm install @xano-sdk/mcp-oauth @xano/sdk
```

`@xano/sdk` is a **peer dependency**, range `>=1.0.0 <2.0.0`. Keep one shared copy, or the statement
and kind registries fork. This package is **tested against 1.0.0** exactly, the version its golden
bundle fixture was generated against.

With the CLI:

```bash
npx xanosdk init my-app --marketplace @xano-sdk/auth,@xano-sdk/mcp-oauth
```

writes the `registerMcpOauth(app, { authTable: userTable })` call for you. It cannot write the
`mcpServer({ oauth: mcpOauth.oauth })` line, because the server is yours. Add it as in the Quickstart.

## Quickstart

```ts
// xano/index.ts
import { workspace, workspaceConfig, table, f, tool, mcpServer, s, auth, ref } from "@xano/sdk";
import { registerMcpOauth } from "@xano-sdk/mcp-oauth";

const users = table({
  name: "user",
  auth: true,
  schema: { email: f.email({ required: true }), password: f.password() },
  index: [{ type: "unique", fields: [{ name: "email" }] }],
});

const app = workspace("notes").registerWorkspace(
  workspaceConfig({ name: "notes", env: { MCP_OAUTH_LOGIN_URL: "" } }),
);
app.registerTables([users]);

export const mcpOauth = registerMcpOauth(app, { authTable: users });

const whoami = tool({
  name: "whoami",
  description: "The signed-in user's email.",
  stack: [s.db.get({ table: users, fieldValue: auth("id"), output: ["email"], as: "me" })],
  response: { email: ref("me.email") },
});

const notes = mcpServer({
  name: "notes",
  tools: [{ tool: whoami, auth: users }],
  oauth: mcpOauth.oauth,
});

app.registerTools([whoami]).registerMcpServers([notes]);
export default app;
```

The platform sends a signing-in browser to `MCP_OAUTH_LOGIN_URL`. That URL can only be known once
the backend exists, so the first deploy happens without it:

1. **Deploy once with the variable empty:**

   ```bash
   npx xanosdk deploy ./xano/index.ts --allow-empty-env=MCP_OAUTH_LOGIN_URL
   ```

2. **Build the login URL.** Take the backend URL the deploy printed and append
   `mcpOauth.loginQuery.getPath()`, here `/api:mcp-oauth-notes/mcp_oauth/login`. On a tenant or an
   ephemeral, the backend URL already includes `/tenant/<name>`:

   ```text
   https://x1ab-cd23-ef45.xano.io/tenant/my-tenant/api:mcp-oauth-notes/mcp_oauth/login
   ```

   Open it in a browser. You should see the page say the sign-in link is incomplete, which is right:
   no client sent you there.

3. **Keep it, and set it live.** Put it in the gitignored `xano/.env`, so every later deploy sends
   it, then set it on the running backend:

   ```bash
   echo 'MCP_OAUTH_LOGIN_URL=https://…/api:mcp-oauth-notes/mcp_oauth/login' >> xano/.env
   printf '%s' 'https://…/api:mcp-oauth-notes/mcp_oauth/login' | npx xanosdk env set MCP_OAUTH_LOGIN_URL
   ```

4. **Connect a client** to the server's MCP URL. It gets a 401, discovers the sign-in, registers
   itself, and opens the page.

Redo steps 2 and 3 when an ephemeral is re-created, because it gets a new host. Each environment
and each tenant has its own value.

If a deploy reports the API group's canonical as a **conflict**, another workspace on the same
instance already uses `mcp-oauth-notes`. Pass your own `canonical` and rebuild the URL from it.

## Working with an auth table

### With `@xano-sdk/auth`

```ts
import { registerAuth, userTable } from "@xano-sdk/auth";
import { registerMcpOauth } from "@xano-sdk/mcp-oauth";

registerAuth(app, { canonical: "authn" });
const mcpOauth = registerMcpOauth(app, { authTable: userTable });
```

`userTable` has `email` and `password` columns, which are the defaults. The two modules don't
depend on each other.

### With your own auth table

Any `table({ auth: true })` works. Name its columns if they differ:

```ts
registerMcpOauth(app, {
  authTable: members,
  emailColumn: "login",
  passwordColumn: "secret", // must be f.password()
  activeColumn: "enabled", // optional f.bool(): false blocks sign-in
});
```

The table needs `created_at`, which the platform uses to identify the signed-in row. Every table
has it unless you set `system: false`.

## The page

One page, two ways to serve it:

- **From your backend** (`GET mcp_oauth/login`). There is nothing to build or host, which makes it
  the quick start, and fine for development.
- **From your own domain** (`exportLoginPage`). This is the production setup. See below.

Either way, it shows:

- your product name and logo
- which server is asking, and which client
- where the browser will be sent afterwards
- whether the client is verified

An unverified client carries a warning, and its logo is never shown: anyone can register a client
with any name and logo. The user signs in, then chooses Allow or Deny on a second screen, and is
sent back to the client.

Branding:

```ts
registerMcpOauth(app, {
  authTable: users,
  brandName: "Acme Notes",
  brandColor: "#0b6bcb",
  brandLogoUrl: "https://cdn.acme.com/logo.png",
});
```

### Host it on your own domain in production

On a shared Xano instance domain (`*.xano.io`), the page shares an origin with every other
workspace on that instance, so script those workspaces serve could reach what your users type. The
endpoint-served page says so in a small developer notice. Turn the notice off with
`sharedDomainNotice: false`.

For production, render the same page and host it yourself:

```ts
// scripts/export-login-page.ts
import { writeFileSync } from "node:fs";
import { exportLoginPage } from "@xano-sdk/mcp-oauth";

const { html, headers } = exportLoginPage({
  apiBaseUrl: "https://api.acme.com/api:mcp-oauth-notes", // your backend URL + /api:<canonical>
  brandName: "Acme Notes",
});
writeFileSync("public/mcp-login.html", html);
console.log(headers); // configure your host to send these
```

Then point `MCP_OAUTH_LOGIN_URL` at the hosted page, for example
`https://login.acme.com/mcp-login.html`. The page calls this module's endpoints cross-origin; the API
group's default CORS allows it.

- **Serve it with the returned headers.** `Content-Security-Policy` (with `frame-ancestors 'none'`),
  `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`. A host that
  cannot set headers still gets most of the policy through a `<meta>` tag, and a frame-buster
  covers framing.
- **Keep the query string.** The platform sends `?mcp_request=…`. An SPA router or a trailing-slash
  redirect that drops it breaks sign-in.
- **Don't transform the HTML.** Minifying it or injecting analytics changes the inline script and
  style, and the CSP authorizes them by hash.
- **Re-export when something changes:** the backend host, the canonical, the tenant, the branding,
  or a module release whose notes say "re-export required". A page that is out of date says so on
  load, before anyone types a password.
- Run `exportLoginPage` in Node (a build script). It hashes the page with `node:crypto`.

## Endpoints

### GET `mcp_oauth/login`

The page. Public. It answers HTML with its CSP and security headers. `mcp_request` is optional, so
the page can report a missing one itself.

### GET `mcp_oauth/request`

Public. `?mcp_request=` → `{ server_name, client_name, client_logo, callback_host, client_verified,
contract }`. It reads the pending sign-in without consuming it. `client_logo` is `""` unless the
client is verified. A link that expired or was already used answers `400 request_expired` or
`request_used`.

### POST `mcp_oauth/sign_in`

Public, rate limited per IP and per email. `{ email, password }` → `{ token }`, a 600-second session
on your auth table. Every refusal is the same `403 "Invalid email or password."`:

- an unknown email
- a wrong password
- a row with no password
- an inactive row

The password check runs every time, so an unknown email takes as long as a known one.

### POST `mcp_oauth/complete`

Authenticated as your auth table (the bearer from `sign_in`). `{ mcp_request, decision: "approve" |
"deny" }` → `{ continue_url }`. The page navigates there, and the platform sends the browser back to
the client with a code, or with `access_denied`.

## Options

| Option | Default | Notes |
|---|---|---|
| `authTable` | required | The MCP server's auth table. The returned `oauth` names it. |
| `emailColumn` | `"email"` | |
| `passwordColumn` | `"password"` | Must be `f.password()`. |
| `activeColumn` | unset | A boolean column that must be true to sign in. |
| `loginUrl` | `env("MCP_OAUTH_LOGIN_URL")` | An `https:` string or `env("NAME")`. |
| `canonical` | `mcp-oauth-<workspace name>` | Pinned so the login URL is stable. Unique per instance. |
| `brandName` | unset | Shown at the top. |
| `brandColor` | `"#2563eb"` | Hex. Reads on light and dark. |
| `brandLogoUrl` | unset | https. Its origin goes into the CSP. |
| `sharedDomainNotice` | `true` | The developer notice on `*.xano.io`. |
| `rateLimit` | `{ max: 5, ttl: 600 }` | Per IP and per email on `sign_in`, or `false`. |
| `history` | `false` | Request bodies carry a password and a bearer token. |

## Identity & the lock

Guids belong to your `xano.lock`, as with every module: commit it. The one thing this module pins is
the API group's **canonical** (`mcp-oauth-<workspace name>`), because the login URL lives in an env
value and must not move under it. That also means `getPath()` resolves without a lock.

## Cherry-picking individual defs

`createMcpOauth({ authTable, canonical })` builds the defs without registering them. Register the
group, then the four queries, and pass `oauth` to your servers. `registerMcpOauth` does exactly
that, and also refuses a second install.

## Response shapes

All derived from the stacks, except `sign_in`'s `{ token: string }`, which is declared: the minted
token is invisible to the static walk. Import them as types:

```ts
import type { McpOauthRequestResponse, McpOauthSignInResponse } from "@xano-sdk/mcp-oauth";
```

## Read before production

- **Host the page on your own domain** (see above). On a shared `*.xano.io` instance domain, other
  workspaces' script shares its origin.
- **The sign-in token reaches further than MCP.** `mcp_oauth/sign_in` returns a full 600-second
  session on your auth table, valid on every endpoint whose `auth` is that table. It does not apply
  your own login's rules, such as email verification or MFA. `activeColumn` covers a disabled
  switch. Anything else must be enforced on the endpoints themselves, or this module is the wrong
  fit.
- **Anyone who knows an email can spend its sign-in attempts.** Failing on purpose against an
  address locks it out of MCP sign-in for the rest of the 10-minute window, and an attacker can
  repeat that every window. Users behind one shared IP also share the per-IP allowance, successful
  sign-ins included. Tune `rateLimit`, or turn it off only where something else limits sign-in.
- **Ten minutes, end to end.** A sign-in dies ten minutes after the client asked, however long the
  page has been open. An expired link says so on load. A user who approves in the last seconds may
  still be sent back with `access_denied`.
- **Same browser.** Sign-in has to finish in the browser that started it. If a client opened an
  in-app browser and the user copies the link into Safari, it fails with "started in a different
  browser".
- **Per environment and per tenant.** `MCP_OAUTH_LOGIN_URL` is resolved where the request arrives.
  On the first promote to production, set production's value and check it with a real connection.
  A value carried over from development points at the wrong backend.
- **One auth table per workspace** in 1.x. One instance of the module serves every MCP server on
  that table.
- **No sign-up or password reset on the page.** It tells users without an account to contact you.
  Pair it with `@xano-sdk/password-reset` for resets.
- **Cancel before sign-in only closes the tab.** The client waits until its own timeout. Deny,
  after sign-in, returns `access_denied` at once.

## Versioning

1.0.x for now: every release is a patch, including an SDK bump. A release that changes the page's
wire contract says "re-export required" in its notes, because an exported page has to be rendered
again.

## License

MIT
