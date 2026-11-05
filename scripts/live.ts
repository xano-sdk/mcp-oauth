// `npm run test:live`: run the whole MCP sign-in over real HTTP, the way a client does: the 401 challenge,
// discovery, client registration, authorize, sign-in, token exchange, then a tool call that runs as the person.
// It deploys to a cloud ephemeral because a local engine serves no OAuth challenge. Set XANO_LIVE_PROFILE to name
// the `xanosdk` profile to use. The ephemeral is deleted at the end. Runs from .live/, a throwaway project, so the
// CLI's records never touch this package. Exits non-zero when a check fails.
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dir = resolve(root, ".live");
const entry = resolve(root, "test/live/index.ts");
mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, "package.json"), JSON.stringify({ name: "live-fixture", private: true }) + "\n");
const bin = resolve(root, "node_modules/.bin/xanosdk");
const profile = process.env.XANO_LIVE_PROFILE ? ["--profile", process.env.XANO_LIVE_PROFILE] : [];
const deploy = (...flags: string[]) => {
  const out = execFileSync(bin, ["deploy", entry, "--ephemeral", "--no-lock", "--yes", "--json", ...profile, ...flags], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  return JSON.parse(out.slice(out.indexOf("{"))) as { url: string; selector: string };
};

// The login URL holds the backend's own address, so it can only be set by a second deploy.
const first = deploy("--name", "mcp-oauth-live", "--expires-hours", "1", "--allow-empty-env=MCP_OAUTH_LOGIN_URL");
const base = first.url.replace(/\/+$/, "");
const api = `${base}/api:mcp-oauth-live/mcp_oauth`;
const tenant = base.split("/").pop() ?? "";
const mcp = `${new URL(base).origin}/x2/mcp/tenant/${tenant}/live-mcp/mcp/stream`;

const results: { name: string; ok: boolean; detail?: string }[] = [];
const check = (name: string, ok: boolean, detail?: unknown) => results.push({ name, ok, ...(ok ? {} : { detail: JSON.stringify(detail) }) });

const json = async (res: Response) => (await res.json().catch(() => null)) as Record<string, unknown> | null;
const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body), redirect: "manual" });
/** One MCP call. The server may answer as JSON or as a server-sent event. */
async function rpc(method: string, params: unknown, token?: string) {
  const res = await post(mcp, { jsonrpc: "2.0", id: 1, method, params }, { accept: "application/json, text/event-stream", ...(token ? { authorization: `Bearer ${token}` } : {}) });
  const text = await res.text();
  const data = text.split("\n").find((l) => l.startsWith("data:"))?.slice(5) ?? text;
  let body: Record<string, unknown> | null = null;
  try { body = JSON.parse(data) as Record<string, unknown>; } catch { /* not JSON */ }
  return { status: res.status, body, challenge: res.headers.get("www-authenticate") };
}

try {
  deploy("--env-var", `MCP_OAUTH_LOGIN_URL=${api}/login`);
  const run = Date.now().toString(36);
  const email = `ada-${run}@example.com`;
  const password = "Correct-horse-9";
  // A first user keeps the signed-in person's id apart from the JSON-RPC id, which is always 1.
  await post(`${base}/api:live/live/user`, { email: `decoy-${run}@example.com`, password });
  const person = await json(await post(`${base}/api:live/live/user`, { email, password }));

  const init = { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "live-check", version: "1" } };
  const anonymous = await rpc("initialize", init);
  check("an unsigned MCP request is refused with a challenge", anonymous.status === 401 && /resource_metadata/.test(anonymous.challenge ?? ""), anonymous);

  const metaUrl = /resource_metadata="([^"]+)"/.exec(anonymous.challenge ?? "")?.[1] ?? "";
  const resource = await json(await fetch(metaUrl));
  const issuer = (resource?.authorization_servers as string[] | undefined)?.[0] ?? "";
  check("the challenge leads to an authorization server", Boolean(issuer), resource);
  const issuerUrl = new URL(issuer);
  const server = await json(await fetch(`${issuerUrl.origin}/.well-known/oauth-authorization-server${issuerUrl.pathname.replace(/\/$/, "")}`));
  check("discovery names the OAuth endpoints", Boolean(server?.authorization_endpoint && server?.token_endpoint && server?.registration_endpoint), server);

  const redirect = "http://127.0.0.1:9/callback";
  const client = await json(await post(String(server?.registration_endpoint), { client_name: "live-check", redirect_uris: [redirect], grant_types: ["authorization_code"], response_types: ["code"], token_endpoint_auth_method: "none" }));
  check("a client can register", typeof client?.client_id === "string", client);

  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(8).toString("hex");
  const authorize = new URL(String(server?.authorization_endpoint));
  for (const [k, v] of Object.entries({ response_type: "code", client_id: String(client?.client_id), redirect_uri: redirect, code_challenge: challenge, code_challenge_method: "S256", state, resource: mcp })) authorize.searchParams.set(k, v);
  const toLogin = await fetch(authorize, { redirect: "manual" });
  const loginUrl = new URL(toLogin.headers.get("location") ?? "http://invalid");
  const request = loginUrl.searchParams.get("mcp_request") ?? "";
  check("authorize sends the browser to the login page", toLogin.status === 302 && loginUrl.href.startsWith(`${api}/login`) && Boolean(request), { status: toLogin.status, location: loginUrl.href });

  const details = await fetch(`${api}/request?mcp_request=${encodeURIComponent(request)}`);
  check("the login page can read the request", details.status === 200, await json(details));
  const wrong = await post(`${api}/sign_in`, { email, password: "Wrong-horse-9" });
  check("a wrong password is refused", wrong.status === 403, wrong.status);
  const signedIn = await json(await post(`${api}/sign_in`, { email, password }));
  const session = String(signedIn?.token ?? "");
  check("sign-in returns a token", Boolean(session), signedIn);
  const done = await json(await post(`${api}/complete`, { mcp_request: request, decision: "approve" }, { authorization: `Bearer ${session}` }));
  check("completing sign-in returns a continue URL", typeof done?.continue_url === "string", done);

  // The browser that started the flow finishes it: the server binds the two with a cookie.
  const cookie = toLogin.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const back = await fetch(String(done?.continue_url), { redirect: "manual", headers: { cookie } });
  const callback = new URL(back.headers.get("location") ?? "http://invalid");
  const code = callback.searchParams.get("code") ?? "";
  check("continue returns the code and the same state", back.status === 302 && Boolean(code) && callback.searchParams.get("state") === state, { status: back.status, location: back.headers.get("location") });

  const tokenRes = await fetch(String(server?.token_endpoint), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirect, client_id: String(client?.client_id), code_verifier: verifier, resource: mcp }),
  });
  const tokens = await json(tokenRes);
  const access = String(tokens?.access_token ?? "");
  check("the code exchanges for an access token", Boolean(access), tokens);

  const initialized = await rpc("initialize", init, access);
  check("the token opens the MCP server", initialized.status === 200, initialized);
  const called = await rpc("tools/call", { name: "whoami", arguments: {} }, access);
  const content = (called.body?.result as { content?: { text?: string }[]; isError?: boolean } | undefined);
  check("a tool call runs as the signed-in person", content?.isError !== true && content?.content?.[0]?.text === String(person?.id), called);
} catch (error) {
  check("the flow reaches the end", false, String(error));
} finally {
  try {
    execFileSync(bin, ["ephemeral", "delete", tenant, "--yes", ...profile], { cwd: dir, stdio: "ignore" });
  } catch {
    console.error(`Could not delete ephemeral ${tenant}. It expires within the hour.`);
  }
}

for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.detail ? `: ${r.detail.slice(0, 320)}` : ""}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed} passed, ${failed} failed`);
if (failed) process.exit(1);
