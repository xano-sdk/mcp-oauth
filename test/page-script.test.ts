/**
 * The page script, run against the real rendered page in a DOM, with `fetch`
 * stubbed at the network boundary and `location.assign` observed.
 */
import { afterEach, describe, expect, it } from "vitest";
import { Window } from "happy-dom";
import { renderPage } from "../src/page/template.js";
import { PAGE_SCRIPT } from "../src/page/script.js";
import { CONTRACT } from "../src/contract.js";

const BRANDING = { brandName: "Acme", brandColor: "#18181b", brandLogoUrl: undefined, sharedDomainNotice: true };
const PAGE_URL = "https://ab12-cd34.dev.xano.io/tenant/t1/api:mcp-oauth-acme/mcp_oauth/login";
const API = "https://ab12-cd34.dev.xano.io/tenant/t1/api:mcp-oauth-acme";
const CONTINUE = "https://ab12-cd34.dev.xano.io/x2/mcp/tenant/t1/srv/oauth/continue?mcp_continue=tok";

type Reply = { status: number; body?: unknown } | "network";
type Routes = Partial<Record<"request" | "sign_in" | "complete", Reply | Reply[]>>;

const windows: any[] = [];
afterEach(async () => {
  for (const w of windows.splice(0)) await w.happyDOM.close();
});

const verifiedRequest = (over: Record<string, unknown> = {}) => ({
  status: 200,
  body: {
    server_name: "Acme Notes",
    client_name: "Claude",
    client_logo: "https://claude.ai/logo.png",
    callback_host: "claude.ai",
    client_verified: true,
    contract: CONTRACT,
    ...over,
  },
});

async function boot(
  routes: Routes,
  opts: { query?: string; url?: string; notice?: boolean; framed?: boolean; apiBaseUrl?: string } = {},
) {
  const url = `${opts.url ?? PAGE_URL}${opts.query ?? "?mcp_request=req-1"}`;
  const w: any = new Window({ url });
  windows.push(w);
  const { html } = renderPage({ ...BRANDING, sharedDomainNotice: opts.notice ?? true }, opts.apiBaseUrl);
  const api = opts.apiBaseUrl ?? API;
  w.document.write(html.replace(/<script>[\s\S]*<\/script>/, ""));
  const calls: { path: string; init: any }[] = [];
  const queue: Record<string, Reply[]> = {};
  for (const [k, v] of Object.entries(routes)) queue[k] = Array.isArray(v) ? [...v] : [v as Reply];
  w.fetch = async (input: string, init: any) => {
    if (!input.startsWith(`${api}/`)) throw new Error(`unexpected origin: ${input}`);
    const path = input.slice(api.length + 1);
    calls.push({ path, init });
    const key = path.split("?")[0]!.replace("mcp_oauth/", "");
    const next = queue[key]?.length ? queue[key]!.length > 1 ? queue[key]!.shift()! : queue[key]![0]! : { status: 500 };
    if (next === "network") throw new TypeError("Failed to fetch");
    return new w.Response(next.body === undefined ? "" : JSON.stringify(next.body), { status: next.status });
  };
  const assigned: string[] = [];
  w.location.assign = (u: string) => assigned.push(u);
  if (opts.framed) Object.defineProperty(w, "top", { value: {}, configurable: true });
  w.eval(PAGE_SCRIPT);
  await settle(w);
  const $ = (id: string) => w.document.getElementById(id);
  const visible = () => ["view-loading", "view-signin", "view-consent", "view-terminal"].filter((v) => !$(v).hidden);
  return { w, $, calls, assigned, visible };
}

const settle = async (w: any) => {
  for (let i = 0; i < 5; i++) await new Promise((r) => w.setTimeout(r, 0));
};

async function signIn(t: Awaited<ReturnType<typeof boot>>, email = "a@b.com", password = "pw") {
  t.$("email").value = email;
  t.$("password").value = password;
  t.$("signin").dispatchEvent(new t.w.Event("submit", { cancelable: true }));
  await settle(t.w);
}

describe("load", () => {
  it("stops at 'incomplete' with no request id, and calls nothing", async () => {
    const t = await boot({}, { query: "" });
    expect(t.visible()).toEqual(["view-terminal"]);
    expect(t.$("view-terminal-heading").textContent).toMatch(/incomplete/);
    expect(t.calls).toHaveLength(0);
  });

  it("derives the API base from its own path, keeping the tenant segment", async () => {
    const t = await boot({ request: verifiedRequest() });
    expect(t.calls[0]!.path).toBe("mcp_oauth/request?mcp_request=req-1");
  });

  it("shows sign-in with the request details on a good request", async () => {
    const t = await boot({ request: verifiedRequest() });
    expect(t.visible()).toEqual(["view-signin"]);
    expect(t.$("request").hidden).toBe(false);
    expect(t.$("client-name").textContent).toBe("Claude");
    expect(t.$("server-name").textContent).toBe("Acme Notes");
    expect(t.$("callback-host").textContent).toBe("claude.ai");
    expect(t.$("unverified-warning").hidden).toBe(true);
    expect(t.$("client-logo").getAttribute("src")).toBe("https://claude.ai/logo.png");
    expect(t.w.document.activeElement.id).toBe("view-signin-heading");
  });

  it("stops at 'out of date' on a contract mismatch, before any form is shown", async () => {
    const t = await boot({ request: verifiedRequest({ contract: CONTRACT + 1 }) });
    expect(t.visible()).toEqual(["view-terminal"]);
    expect(t.$("view-terminal-heading").textContent).toMatch(/out of date/);
  });

  it("stops at 'out of date' on a 404 from request", async () => {
    const t = await boot({ request: { status: 404, body: { message: "Unable to locate request." } } });
    expect(t.$("view-terminal-heading").textContent).toMatch(/out of date/);
  });

  it("stops at expired/used on request_used", async () => {
    const t = await boot({ request: { status: 400, body: { message: "request_used", payload: { reason: "request_used" } } } });
    expect(t.$("view-terminal-heading").textContent).toMatch(/expired or was already used/);
    expect(t.$("terminal-retry").hidden).toBe(true);
  });

  it("names a misconfiguration code so a report reaches the developer", async () => {
    const t = await boot({ request: { status: 400, body: { message: "wrong_tenant" } } });
    expect(t.$("view-terminal-heading").textContent).toMatch(/misconfigured/);
    expect(t.$("terminal-text").textContent).toContain("wrong_tenant");
  });

  it("offers a retry on a network error, and retrying re-runs the load", async () => {
    const t = await boot({ request: ["network", verifiedRequest()] });
    expect(t.$("terminal-retry").hidden).toBe(false);
    t.$("terminal-retry").click();
    await settle(t.w);
    expect(t.visible()).toEqual(["view-signin"]);
    expect(t.calls.filter((c) => c.path.startsWith("mcp_oauth/request"))).toHaveLength(2);
  });
});

describe("the request display", () => {
  it("warns about an unverified client and never shows its logo", async () => {
    const t = await boot({ request: verifiedRequest({ client_verified: false, client_logo: "https://evil.example/logo.png" }) });
    expect(t.$("unverified-warning").hidden).toBe(false);
    expect(t.$("client-logo").hidden).toBe(true);
    expect(t.$("client-logo").getAttribute("src")).toBeNull();
    expect(t.$("client-status").textContent).toBe("Not verified");
  });

  it("names empty and loopback values instead of leaving a blank", async () => {
    let t = await boot({ request: verifiedRequest({ client_name: "", callback_host: "" }) });
    expect(t.$("client-name").textContent).toBe("An unnamed application");
    expect(t.$("callback-host").textContent).toBe("an app on this device");
    t = await boot({ request: verifiedRequest({ callback_host: "127.0.0.1" }) });
    expect(t.$("callback-host").textContent).toBe("a program on this computer");
  });

  it("renders a hostile client name as text, stripped of bidi controls", async () => {
    const t = await boot({ request: verifiedRequest({ client_name: '<img src=x onerror="alert(1)">‮evil' }) });
    expect(t.$("client-name").textContent).toBe('<img src=x onerror="alert(1)">evil');
    expect(t.$("client-name").querySelector("img")).toBeNull();
  });
});

describe("sign-in", () => {
  it("keeps the email, clears the password and announces a credential error", async () => {
    const t = await boot({ request: verifiedRequest(), sign_in: { status: 403, body: { message: "Invalid email or password." } } });
    await signIn(t);
    expect(t.visible()).toEqual(["view-signin"]);
    expect(t.$("email").value).toBe("a@b.com");
    expect(t.$("password").value).toBe("");
    expect(t.$("signin-error").textContent).toMatch(/don't match/);
    expect(t.$("signin-error").getAttribute("aria-live")).toBe("assertive");
    expect(t.w.document.activeElement.id).toBe("email");
  });

  it("says 'too many attempts' on a 429", async () => {
    const t = await boot({ request: verifiedRequest(), sign_in: { status: 429, body: {} } });
    await signIn(t);
    expect(t.$("signin-error").textContent).toMatch(/Too many attempts/);
  });

  it("moves to consent, focused on Allow for a verified client", async () => {
    const t = await boot({ request: verifiedRequest(), sign_in: { status: 200, body: { token: "tok-1" } } });
    await signIn(t);
    expect(t.visible()).toEqual(["view-consent"]);
    expect(t.$("request").hidden).toBe(false);
    expect(t.$("signed-in-as").textContent).toBe("a@b.com");
    expect(t.$("password").value).toBe("");
    expect(t.w.document.activeElement.id).toBe("allow");
  });

  it("focuses Deny, not Allow, for an unverified client", async () => {
    const t = await boot({ request: verifiedRequest({ client_verified: false }), sign_in: { status: 200, body: { token: "t" } } });
    await signIn(t);
    expect(t.w.document.activeElement.id).toBe("deny");
  });

  it("cancels before sign-in without calling anything", async () => {
    const t = await boot({ request: verifiedRequest() });
    t.$("signin-cancel").click();
    await settle(t.w);
    expect(t.$("terminal-text").textContent).toMatch(/close this tab/);
    expect(t.calls).toHaveLength(1);
  });

  it("never stores the token", async () => {
    const t = await boot({ request: verifiedRequest(), sign_in: { status: 200, body: { token: "tok-secret" } } });
    await signIn(t);
    expect(t.w.localStorage.length).toBe(0);
    expect(t.w.sessionStorage.length).toBe(0);
    expect(t.w.document.documentElement.outerHTML).not.toContain("tok-secret");
  });
});

describe("complete", () => {
  const signedIn = async (complete: Reply | Reply[], request = verifiedRequest()) => {
    const t = await boot({ request, sign_in: { status: 200, body: { token: "tok-1" } }, complete });
    await signIn(t);
    return t;
  };

  it("sends the decision with the bearer token and navigates to the continue URL", async () => {
    const t = await signedIn({ status: 200, body: { continue_url: CONTINUE } });
    t.$("allow").click();
    await settle(t.w);
    const call = t.calls.find((c) => c.path === "mcp_oauth/complete")!;
    expect(call.init.headers.authorization).toBe("Bearer tok-1");
    expect(JSON.parse(call.init.body)).toEqual({ mcp_request: "req-1", decision: "approve" });
    expect(t.assigned).toEqual([CONTINUE]);
    expect(t.$("terminal-text").textContent).toMatch(/Returning you to claude\.ai/);
  });

  it("sends deny", async () => {
    const t = await signedIn({ status: 200, body: { continue_url: CONTINUE } });
    t.$("deny").click();
    await settle(t.w);
    expect(JSON.parse(t.calls.find((c) => c.path === "mcp_oauth/complete")!.init.body).decision).toBe("deny");
    expect(t.assigned).toEqual([CONTINUE]);
  });

  it("sends complete exactly once on a double click", async () => {
    const t = await signedIn({ status: 200, body: { continue_url: CONTINUE } });
    t.$("allow").click();
    t.$("allow").click();
    t.$("deny").click();
    await settle(t.w);
    expect(t.calls.filter((c) => c.path === "mcp_oauth/complete")).toHaveLength(1);
    expect(t.assigned).toHaveLength(1);
  });

  it("treats a 401 as expired and drops the token", async () => {
    const t = await signedIn({ status: 401, body: { message: "This token is expired." } });
    t.$("allow").click();
    await settle(t.w);
    expect(t.$("view-terminal-heading").textContent).toMatch(/expired or was already used/);
    expect(t.assigned).toHaveLength(0);
  });

  it("treats stale_session as expired", async () => {
    const t = await signedIn({ status: 400, body: { message: "stale_session" } });
    t.$("allow").click();
    await settle(t.w);
    expect(t.$("view-terminal-heading").textContent).toMatch(/expired or was already used/);
  });

  it("refuses a plain-http continue URL on any host but localhost", async () => {
    const t = await signedIn({ status: 200, body: { continue_url: "http://evil.example/continue?x=1" } });
    t.$("allow").click();
    await settle(t.w);
    expect(t.assigned).toHaveLength(0);
    expect(t.$("view-terminal-heading").textContent).toMatch(/went wrong/);
  });

  it("navigates to an http://localhost continue URL (development instances)", async () => {
    const t = await signedIn({ status: 200, body: { continue_url: "http://localhost:3000/continue?x=1" } });
    t.$("allow").click();
    await settle(t.w);
    expect(t.assigned).toEqual(["http://localhost:3000/continue?x=1"]);
  });

  it("refuses to navigate to a non-https continue URL", async () => {
    const t = await signedIn({ status: 200, body: { continue_url: "javascript:alert(1)" } });
    t.$("allow").click();
    await settle(t.w);
    expect(t.assigned).toHaveLength(0);
    expect(t.$("view-terminal-heading").textContent).toMatch(/went wrong/);
  });

  it("stays on consent with a retryable error after a network failure", async () => {
    const t = await signedIn(["network", { status: 200, body: { continue_url: CONTINUE } }]);
    t.$("allow").click();
    await settle(t.w);
    expect(t.visible()).toEqual(["view-consent"]);
    expect(t.$("consent-error").textContent).toMatch(/couldn't reach/);
    t.$("allow").click();
    await settle(t.w);
    expect(t.assigned).toEqual([CONTINUE]);
  });

  it("'use a different account' drops the token and returns to sign-in", async () => {
    const t = await signedIn({ status: 200, body: { continue_url: CONTINUE } });
    t.$("switch-account").click();
    await settle(t.w);
    expect(t.visible()).toEqual(["view-signin"]);
    t.$("allow").click();
    await settle(t.w);
    expect(t.calls.filter((c) => c.path === "mcp_oauth/complete")).toHaveLength(0);
  });
});

describe("back/forward cache and exported mode", () => {
  it("drops the token and reloads when restored from the back/forward cache", async () => {
    const t = await boot({ request: verifiedRequest(), sign_in: { status: 200, body: { token: "tok-1" } } });
    await signIn(t);
    expect(t.visible()).toEqual(["view-consent"]);
    t.w.dispatchEvent(Object.assign(new t.w.Event("pageshow"), { persisted: true }));
    await settle(t.w);
    expect(t.visible()).toEqual(["view-signin"]);
    expect(t.calls.filter((c) => c.path.startsWith("mcp_oauth/request"))).toHaveLength(2);
    t.$("allow").click();
    await settle(t.w);
    expect(t.calls.filter((c) => c.path === "mcp_oauth/complete")).toHaveLength(0);
  });

  it("ignores a pageshow that is not a cache restore", async () => {
    const t = await boot({ request: verifiedRequest() });
    t.w.dispatchEvent(Object.assign(new t.w.Event("pageshow"), { persisted: false }));
    await settle(t.w);
    expect(t.calls).toHaveLength(1);
  });

  it("uses the baked-in API base when exported, whatever origin serves it", async () => {
    const t = await boot(
      { request: verifiedRequest() },
      { url: "https://login.acme.com/mcp-login.html", apiBaseUrl: "https://api.acme.com/tenant/t1/api:mcp-oauth-acme" },
    );
    expect(t.visible()).toEqual(["view-signin"]);
    expect(t.calls[0]!.path).toBe("mcp_oauth/request?mcp_request=req-1");
  });

  it("keeps a verified client's non-https logo hidden", async () => {
    const t = await boot({ request: verifiedRequest({ client_logo: "http://claude.ai/logo.png" }) });
    expect(t.$("client-logo").hidden).toBe(true);
    expect(t.$("client-logo").getAttribute("src")).toBeNull();
  });
});

describe("the page's surroundings", () => {
  it("shows the shared-domain notice on *.xano.io", async () => {
    const t = await boot({ request: verifiedRequest() });
    expect(t.$("shared-notice").hidden).toBe(false);
  });

  it("hides the notice on another host, and when switched off", async () => {
    let t = await boot({ request: verifiedRequest() }, { url: "https://login.acme.com/", query: "?mcp_request=req-1" });
    expect(t.$("shared-notice").hidden).toBe(true);
    t = await boot({ request: verifiedRequest() }, { notice: false });
    expect(t.$("shared-notice").hidden).toBe(true);
  });

  it("hides everything and calls nothing when framed, even after a cache restore", async () => {
    const t = await boot({ request: verifiedRequest() }, { framed: true });
    expect(t.$("app").hidden).toBe(true);
    expect(t.calls).toHaveLength(0);
    t.w.dispatchEvent(Object.assign(new t.w.Event("pageshow"), { persisted: true }));
    await settle(t.w);
    expect(t.calls).toHaveLength(0);
  });
});
