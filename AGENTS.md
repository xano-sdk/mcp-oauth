# AGENTS.md

If you are an agent **consuming** the published package, read [llms.txt](llms.txt) instead. This
file is for working on the repo.

## What this is

`@xano-sdk/mcp-oauth` is a Xano SDK workspace module. It gives MCP servers hosted-mode OAuth
sign-in. `registerMcpOauth(app, { authTable })` adds one API group and four endpoints:

- the sign-in and consent page
- `request`
- `sign_in`
- `complete`

It returns the `oauth` block for `mcpServer()`. `exportLoginPage` renders the same page for
hosting elsewhere. There is no runtime: every export is a typed def object, and the consumer's
`Xano` instance does all encoding at `export()`.

## Commands

```bash
npm run build          # tsup → dist/ (esm + d.ts)
npm run typecheck      # tsc --noEmit
npm run lint           # eslint .
npm test               # tsc --noEmit && vitest run (type-level tests need the typecheck)
npm run fixture:regen  # rewrite the golden bundle - a reviewed act, see below
```

Run `npm run typecheck && npm run lint && npm test` before committing.

## Layout

- `src/index.ts` - the whole public surface.
- `src/options.ts` - option types and `resolveOptions` / `resolveBranding`, the single
  validation gate. Every check runs here, before any def is built.
- `src/register.ts` - `createMcpOauth` / `registerMcpOauth` and the `WeakSet` guard.
- `src/contract.ts` - the page↔endpoint wire contract version.
- `src/api/` - the group, one factory per endpoint, the rate limiter, client types.
- `src/page/` - the page: `script.ts` (one constant, both modes), `styles.ts`, `template.ts`,
  `csp.ts`, `export.ts`.
- `test/` - one file per surface. `golden.ts` plus `fixtures/golden-bundle.json` hold the
  byte contract.
- `scripts/regen-golden.ts` - writes the fixture.
- `local-files/` - gitignored. Live probes (`probe/`) and the end-to-end consumer project
  (`e2e/`).

## Rules that bite

- **Defs are factories.** Every def references the consumer's auth table, and `f.tableRef` or an
  auth reference resolves at construction time. A module-level def would bake in the wrong table.
- **Never widen a stack.** A query's `stack` stays a literal tuple. A helper returning
  `Statement[]` spread into it, or a conditional spread, collapses it, and every `ref()` resolves
  to `unknown`. Nothing in this repo fails when that happens; a consumer's typecheck does.
  `test/types.test.ts` is the only guard. That is why an optional step is kept and set
  `disabled: true` (the limiter, the `activeColumn` check) rather than spread in or out.
- **Never use `unsafe_user_id`.** It skips the platform's table and session checks. Sign-in is two
  requests on purpose: minting a token does not authenticate the request that minted it.
- **The `complete` endpoint's `auth` is the consumer's auth table, and so is `oauth.authTable`.**
  Both come from one option. The platform refuses a session from any other table.
- **`sign_in` checks a hash on every request.** It uses the row's own hash when usable, else
  `DUMMY_HASH`, and decides every refusal after the check. An early return on a miss is a timing
  oracle for which emails have accounts. `has_password` must be true too, so a passwordless row is
  refused whatever the dummy check said. Every refusal uses one message.
- **The page script is one constant, LF-only, with no backticks or `${`.** Its CSP hash is pinned
  by the golden test and must be identical in both modes, so per-page data lives on
  `<body data-*>`. Browsers hash inline content after turning CRLF into LF.
- **Runtime values reach the DOM only through `textContent`.** The client name is chosen by
  whoever registered the client.
- **The token lives in one closure variable.** Never in storage.
- **`complete` is sent at most once per page load.** Responses after navigation starts are
  ignored.
- **The group's canonical is pinned** (`mcp-oauth-<workspace name>`), unlike other modules. The
  login URL is an env value built from it. Canonicals are unique per instance, so the default
  carries the workspace name, and `canonical` overrides it.
- **History is off on the group.** `sign_in` carries a password and `complete` a bearer token.
- **`mcp_oauth/request` and its `contract` field are frozen for 1.x.** They carry the
  exported-page staleness check. Bump `CONTRACT` only when a route, input or response the page
  uses changes, and say "re-export required" in that release's notes.
- **No platform source names, repo names or internal class names** in shipped files.

## Project policy

- **Clean over backwards-compatible.** Nobody consumes this package yet, so when
  a cleaner shape and a compatible one conflict, take the clean one and say so in
  the release notes. Revisit once there are real consumers.
- **Versions start at 1.0.0 under `@xano-sdk/mcp-oauth` and only increment 1.0.x
  for now**, regardless of what a release changes. Do not bump unless told. See
  **Release** below.

## Facts verified against a live instance

Record what a live probe establishes, DATED, with the SDK version. Mark a claim superseded in
place rather than deleting it.

### 2026-10-03 - ephemeral `e9jd-sds2-2923` (a tenant on a `*.dev.xano.io` instance), SDK 1.0.0

Probe: `local-files/probe/u2.ts` (gitignored) plus the scripted client
`local-files/probe/mcp-client.ts`.

- **An endpoint serves a raw HTML page.** `respond.header("Content-Type", "text/html; charset=utf-8")`
  plus `response: c.text(PAGE)` answers the string verbatim. The `Content-Security-Policy`,
  `Referrer-Policy` and `Cache-Control` headers set the same way arrive unchanged. The platform adds
  `X-Frame-Options: deny`, `nosniff` and no-cache headers on its own and sets no CSP.
- **The engine returns the bytes exactly.** The served inline script and style hash to the values
  computed at build time, including non-ASCII, CRLF, backslashes, quotes, `<` and `${…}`.
- **But browsers hash inline content after newline normalization.** Chrome refused a CSP hashed over
  CRLF bytes and accepted one hashed over the same text with CRLF/CR turned into LF. So the page
  template must contain LF only (a test asserts no `\r`), or every hash must be computed over the
  normalized text.
- **`?mcp_request=` binds to a GET input**, and the page script can read it from `location.search`.
- **Hosted MCP OAuth runs on an ephemeral, inside its tenant.** The full flow passed end to end:
  401 challenge, discovery, dynamic client registration, authorize (302 to the login URL with
  `mcp_request`), `s.mcp.oauth.request`, sign-in, `s.mcp.oauth.complete`, continue (302 back with
  `code` and `state`), token exchange, and a tool call whose `auth()` was the signed-in row.
- **A token past its expiry gets `401 "This token is expired."` from the endpoint's auth block**,
  before `complete` runs. A forged or expired request id gets `400 request_expired` from both
  `request` and `complete`.
- **An unknown email and a wrong password both get `403 "Invalid Credentials."`.** A user row with
  no password hash makes `check_password` fail with `500 "Invalid password syntax."`. That reveals
  the account exists, so `sign_in` must refuse a null or empty hash before checking it, with the
  same generic message.
- **A stored password hash is `<16 hex salt>.<64 hex digest>`, and `check_password` refuses a
  bcrypt string** with the same `500 "Invalid password syntax."`. `sign_in`'s dummy hash
  (`DUMMY_HASH` in `src/api/sign-in.ts`) was minted by seeding a throwaway row with a random
  password, reading its stored hash back, and discarding the password. Re-mint it the same way if
  the engine ever changes the format, and the U7 run will show it (every sign-in would 500).
- **The group's default CORS allows a cross-origin call carrying `Authorization`.** Chrome, from
  `https://example.com`, completed `sign_in` and then `complete` with a bearer token. The preflight
  echoes the origin and answers `Access-Control-Allow-Headers: *`. Safari and Firefox were not
  checked.

### 2026-10-03 - ephemeral `ez0a-1tfk-9245`, SDK 1.0.0, module 1.0.0 from the packed tarball

End-to-end run (U7). The consumer project in `local-files/e2e/` installs the packed tarball,
registers the module with `activeColumn`, and puts a one-tool MCP server behind `mcpOauth.oauth`.
It was deployed following the README Quickstart steps exactly.

- **The Quickstart works as written.** The first deploy with `--allow-empty-env=MCP_OAUTH_LOGIN_URL`
  succeeded. The login page answered `200 text/html` at `<backend URL>` + `loginQuery.getPath()`,
  which also shows the pinned canonical was honored. Writing the URL to `xano/.env` and running
  `xanosdk env set` made it live. A later redeploy kept it, because `xano/.env` is read on every deploy.
- **The backend URL includes the tenant segment.** On an ephemeral (a tenant), the login URL is
  `https://<host>/tenant/<name>` + `getPath()`, not the bare host. The deploy prints that backend URL.
- **Endpoint mode, scripted and in real Chrome:** approve reached a tool call whose `auth()` was
  the signed-in row, and deny returned `access_denied` to the client.
- **Exported mode, in real Chrome:** `exportLoginPage` served from `http://localhost:8765` called the
  endpoints cross-origin (sign_in, then complete with a bearer token) under its own meta CSP, with no
  violations. The callback received `code` and `state`. An `http://localhost` login URL set through
  the env var was accepted.
- **Sign-in refusals are identical:** unknown email, wrong password, a row with no password, and an
  `activeColumn` false all got `403 "Invalid email or password."`. The sixth attempt from one IP
  inside the window got 429.
- **Reloading a consumed request stops at load** with the expired/used state, before the form.
- **The default accent was invisible on the dark card.** `#18181b` (the email-module default) made
  the primary button vanish in dark mode, so the default is now `#2563eb`.
- **Re-run after the review fixes (same ephemeral, same day):** `sign_in` now swaps in a row's
  hash only when it matches the engine format (`regex_test` against
  `^[0-9a-f]{16}\.[0-9a-f]{64}$`). The real stored hash matched, so sign-in and the full client
  flow to a tool call still pass. Wrong password, no password, unknown email and inactive users
  still get the generic 403. A foreign-format hash (an imported bcrypt string) could not be
  seeded, because an `f.password()` column hashes what it is given. That case rests on the unit
  test and the earlier probe showing such a hash makes `check_password` fail with a 500.
- Not covered here: a real interactive MCP client (Claude, MCP Inspector). The scripted client
  follows the same discovery the 2025-06-18 spec defines.

## The peer range

`peerDependencies["@xano/sdk"]` is `>=1.0.0 <2.0.0`. The dev pin is exact (`1.0.0`, no caret):
it is the version the golden fixture was generated against, and the number README and llms.txt
quote as tested.

- **The floor** moves only when an SDK type or encoding this package relies on changes. Verify a
  new floor by installing it and running the suite. Don't just assert it.
- **The ceiling** is the next SDK major.
- README, llms.txt and `package.json` state these numbers. Change all three in one commit.

## The golden-bundle contract

`test/bundle.test.ts` deep-equals the exported bundle against `test/fixtures/golden-bundle.json`,
raw. The fixture holds the endpoints, the headers and the whole rendered page, including the
script's CSP hash. The golden config sets every option to a non-default value, and a coverage
assertion fails if an option is added without it.

A failing golden test means the encoding moved. Find out why first. Only then run
`npm run fixture:regen` and read the diff line by line.

## Release

While the 1.0.x policy (see **Project policy**) stands, every release is a patch
regardless of what changed — including an SDK bump, which would otherwise be a
**minor** here because the peer contract a consumer installs against changes even
when no export does. Revisit when that policy lifts.

Publish from a green tree on the default branch, after the PR merges.

1. For an SDK bump, read the SDK diff first (its `CHANGELOG.md`, `llms.txt`, `README.md`). Move
   the dev pin, and move the peer floor or ceiling only as **The peer range** says.
2. Run `npm run typecheck && npm run lint && npm test`. Regenerate the golden fixture only if the
   bundle legitimately changed, and review the diff.
3. Update the version numbers in `README.md` and `llms.txt` in the same commit.
4. Version, publish and tag:

   ```bash
   npm version patch -m "chore(release): %s"   # bumps package.json + tags vX.Y.Z
   npm run release                             # prepublishOnly rebuilds dist/
   git push --follow-tags
   ```

   `npm pack --dry-run` should list `dist/index.js`, `dist/index.d.ts`, `README.md`,
   `AGENTS.md`, `llms.txt`, `LICENSE` and `package.json`, and nothing else.
   `test/published-docs.test.ts` pins that.
5. Write the GitHub release from the template (below). Publishing it posts to Slack.
6. Re-run the end-to-end check (`local-files/e2e/`, see the live facts above) against the
   published package before announcing a contract change.

### Then list it

The marketplace entry lives in the marketplace repo. Follow the SDK's module guide for the
listing:

- `includes`: the four endpoints
- `requirements`: an auth table with email, password and `created_at`; set
  `MCP_OAUTH_LOGIN_URL`
- `register_snippet`: must include the `mcpServer({ oauth: mcpOauth.oauth })` line and compile
- `agent_prompt`

Check it with `xanosdk marketplace details @xano-sdk/mcp-oauth --prompt`.

### Release notes

Start from [.github/RELEASE_TEMPLATE.md](https://github.com/xano-sdk/mcp-oauth/blob/main/.github/RELEASE_TEMPLATE.md) — it
carries both the shape and the constraints the Slack announcement imposes, and
its guidance lives in HTML comments that are stripped before Slack sees them, so
it can stay in the draft while you write.

- The GitHub release **name** (not the tag) becomes the Slack header verbatim:
  `vX.Y.Z — Three-to-five word theme`, standing on its own.
- Everything before the first `##` is the summary block. No story — a brief
  paragraph and the install snippet.
- Cover every noteworthy change since the previous release, not only the
  headline one. Anything a consumer needs to act on goes in too.
- **Each change gets its own `##` heading**, because those headings become the
  itemized Slack bullets (first 8 shown, rest collapse). Write each as a claim
  that survives with no body text under it. Purely structural headings (Notes,
  Compatibility, Verification, …) are dropped from the bullets, so use them
  freely — just never hide a change under one.

Publishing a GitHub release fires `.github/workflows/release-slack.yml`, which
runs `.github/scripts/test_slack_release_message.py` in the same job that posts —
a malformed payload fails the workflow rather than reaching Slack. That suite
renders `RELEASE_TEMPLATE.md` through the real builder, so a change to either
file has to keep the other true. Both the builder and that test are kept
identical to `xano-sdk/sdk-dev`'s, modulo the repo and package names; port fixes
between the two rather than letting them diverge. Check a draft locally first:

```bash
cd .github/scripts && python3 test_slack_release_message.py
```

The workflow posts to the `SLACK_WEBHOOK_URL` repository secret.
