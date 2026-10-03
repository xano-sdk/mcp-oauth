/**
 * The page's one inline script, identical in both delivery modes so its CSP
 * hash is a constant the golden test pins. Everything that differs per page
 * (API base, contract, notice) arrives through `data-` attributes on <body>.
 *
 * Rules it keeps, each with a reason:
 * - Runtime values (client name, callback host, email) only ever reach the DOM
 *   through `textContent`. The client name is chosen by whoever registered the
 *   client; interpolating it as HTML would let any client inject markup.
 * - The session token lives in one closure variable. Never storage: a token in
 *   localStorage outlives the tab and is readable by anything on the origin.
 * - `complete` is sent at most once per load, and every response that arrives
 *   after navigation starts is ignored, so a double click cannot flash
 *   "already used" over a redirect that worked.
 * - The continue URL is only ever navigated to, never rewritten or shown as a
 *   link: it is single-use and only works in this browser.
 *
 * LF line endings only, and no backticks or `${` (it is a String.raw literal).
 */
export const PAGE_SCRIPT = String.raw`
(function () {
  "use strict";
  var body = document.body;
  var $ = function (id) { return document.getElementById(id); };
  var CONTRACT = Number(body.getAttribute("data-contract"));
  var base = body.getAttribute("data-api-base") || "";
  if (base === "") {
    base = location.origin + location.pathname.replace(/\/mcp_oauth\/login\/?$/, "");
  }
  var requestId = new URLSearchParams(location.search).get("mcp_request") || "";
  var state = "loading";
  var token = null;
  var email = "";
  var details = null;
  var MISCONFIGURED = ["wrong_tenant", "wrong_server", "wrong_table", "datasource_mismatch"];

  function clean(text, max) {
    var s = String(text == null ? "" : text).replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "").trim();
    return s.length > max ? s.slice(0, max - 1) + "\u2026" : s;
  }

  function setText(id, text) { $(id).textContent = text; }

  function show(view, focusId) {
    ["view-loading", "view-signin", "view-consent", "view-terminal"].forEach(function (v) { $(v).hidden = v !== view; });
    $("request").hidden = !(view === "view-signin" || view === "view-consent");
    var target = $(focusId || view + "-heading");
    if (target) target.focus();
  }

  function terminal(title, text, retry) {
    state = "terminal";
    token = null;
    setText("view-terminal-heading", title);
    setText("terminal-text", text);
    $("terminal-retry").hidden = !retry;
    show("view-terminal");
  }

  var EXPIRED = ["This sign-in link expired or was already used", "Return to your app and connect again."];
  var OUTDATED = ["This sign-in page is out of date", "The app's developer needs to update this page. Return to your app and try again later."];

  function refusal(res, data) {
    var reason = data && (data.message || (data.payload && data.payload.reason)) || "";
    if (res.status === 401 || reason === "stale_session" || reason === "request_expired" || reason === "request_used") {
      return terminal(EXPIRED[0], EXPIRED[1], false);
    }
    if (MISCONFIGURED.indexOf(reason) !== -1) {
      return terminal("This sign-in page is misconfigured", "Tell the app's developer this code: " + reason + ".", false);
    }
    return null;
  }

  function call(path, init) {
    return fetch(base + "/" + path, init).then(function (res) {
      return res.text().then(function (t) {
        var data = null;
        try { data = t ? JSON.parse(t) : null; } catch (e) { data = null; }
        return { res: res, data: data };
      });
    });
  }

  function describeHost(host) {
    if (!host) return "an app on this device";
    if (host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1") return "a program on this computer";
    return host;
  }

  function renderRequest(d) {
    details = d;
    var name = clean(d.client_name, 80) || "An unnamed application";
    setText("client-name", name);
    setText("server-name", clean(d.server_name, 80) || "this app");
    setText("callback-host", describeHost(clean(d.callback_host, 120)));
    var verified = d.client_verified === true;
    setText("client-status", verified ? "Verified" : "Not verified");
    $("unverified-warning").hidden = verified;
    var logo = $("client-logo");
    if (verified && typeof d.client_logo === "string" && d.client_logo.indexOf("https://") === 0) {
      logo.referrerPolicy = "no-referrer";
      logo.src = d.client_logo;
      logo.hidden = false;
    } else {
      logo.removeAttribute("src");
      logo.hidden = true;
    }
  }

  function load() {
    state = "loading";
    token = null;
    show("view-loading");
    if (!requestId) return terminal("This sign-in link is incomplete", "Return to your app and connect again.", false);
    call("mcp_oauth/request?mcp_request=" + encodeURIComponent(requestId), { method: "GET" }).then(function (r) {
      if (r.res.status === 404) return terminal(OUTDATED[0], OUTDATED[1], false);
      if (r.res.ok) {
        if (!r.data || r.data.contract !== CONTRACT) return terminal(OUTDATED[0], OUTDATED[1], false);
        renderRequest(r.data);
        state = "signin";
        return show("view-signin");
      }
      if (r.res.status >= 400 && r.res.status < 500 && refusal(r.res, r.data) === null) {
        return terminal("Something went wrong", "Return to your app and connect again.", false);
      }
      if (r.res.status >= 500) terminal("We couldn't load this sign-in", "Check your connection and try again.", true);
    }, function () {
      terminal("We couldn't load this sign-in", "Check your connection and try again.", true);
    });
  }

  function busy(ids, on) { ids.forEach(function (id) { $(id).disabled = on; }); }

  $("signin").addEventListener("submit", function (event) {
    event.preventDefault();
    if (state !== "signin") return;
    state = "signing-in";
    setText("signin-error", "");
    busy(["signin-submit", "signin-cancel"], true);
    email = $("email").value.trim();
    call("mcp_oauth/sign_in", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email, password: $("password").value }),
    }).then(function (r) {
      busy(["signin-submit", "signin-cancel"], false);
      if (state !== "signing-in") return;
      if (r.res.ok && r.data && typeof r.data.token === "string") {
        token = r.data.token;
        $("password").value = "";
        setText("signed-in-as", email);
        state = "consent";
        var verified = details && details.client_verified === true;
        return show("view-consent", verified ? "allow" : "deny");
      }
      state = "signin";
      $("password").value = "";
      if (r.res.status === 429) setText("signin-error", "Too many attempts. Wait a few minutes and try again.");
      else if (r.res.status === 403 || r.res.status === 400) setText("signin-error", "That email and password don't match an account.");
      else setText("signin-error", "Something went wrong. Try again.");
      $("email").focus();
    }, function () {
      busy(["signin-submit", "signin-cancel"], false);
      state = "signin";
      setText("signin-error", "We couldn't reach the server. Try again.");
    });
  });

  $("signin-cancel").addEventListener("click", function () {
    if (state !== "signin") return;
    terminal("Sign-in cancelled", "You can close this tab.", false);
  });

  function decide(decision) {
    if (state !== "consent" || token === null) return;
    state = "completing";
    setText("consent-error", "");
    busy(["allow", "deny", "switch-account"], true);
    call("mcp_oauth/complete", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + token },
      body: JSON.stringify({ mcp_request: requestId, decision: decision }),
    }).then(function (r) {
      if (state !== "completing") return;
      busy(["allow", "deny", "switch-account"], false);
      if (r.res.ok && r.data && typeof r.data.continue_url === "string") {
        var url;
        try { url = new URL(r.data.continue_url); } catch (e) { url = null; }
        var safe = url && (url.protocol === "https:" || (url.protocol === "http:" && url.hostname === "localhost"));
        if (!safe) return terminal("Something went wrong", "Return to your app and connect again.", false);
        state = "navigating";
        token = null;
        setText("view-terminal-heading", decision === "approve" ? "Returning you to your app" : "Access denied");
        setText("terminal-text", "Returning you to " + describeHost(clean(details && details.callback_host, 120)) + "\u2026");
        $("terminal-retry").hidden = true;
        show("view-terminal");
        location.assign(url.href);
        return;
      }
      if (refusal(r.res, r.data) !== null) return;
      state = "consent";
      setText("consent-error", r.res.status === 429 ? "Too many attempts. Wait a few minutes and try again." : "Something went wrong. Try again.");
    }, function () {
      if (state !== "completing") return;
      busy(["allow", "deny", "switch-account"], false);
      state = "consent";
      setText("consent-error", "We couldn't reach the server. Try again.");
    });
  }

  $("allow").addEventListener("click", function () { decide("approve"); });
  $("deny").addEventListener("click", function () { decide("deny"); });
  $("switch-account").addEventListener("click", function () {
    if (state !== "consent") return;
    token = null;
    state = "signin";
    $("password").value = "";
    show("view-signin", "email");
  });
  $("terminal-retry").addEventListener("click", function () { load(); });

  if (window.top !== window.self) {
    $("app").hidden = true;
    return;
  }

  window.addEventListener("pageshow", function (event) { if (event.persisted) load(); });

  var host = location.hostname;
  $("shared-notice").hidden = !(body.getAttribute("data-notice") === "1" && /(^|\.)xano\.io$/.test(host));

  load();
})();
`;
