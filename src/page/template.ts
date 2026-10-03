/**
 * The sign-in and consent page, assembled at build time.
 *
 * Branding is baked in, HTML-escaped. Everything about the pending sign-in
 * (client, server, callback host) arrives at runtime and is written by the
 * script with `textContent`, never interpolated here. Per-page data rides on
 * `<body data-*>` so the script - and its CSP hash - is the same in both modes.
 */
import { CONTRACT } from "../contract.js";
import { PAGE_SCRIPT } from "./script.js";
import { stylesFor } from "./styles.js";
import { cspMeta, pageHeaders, type CspInput, type PageHeaders } from "./csp.js";
import type { ResolvedBranding } from "../options.js";

export interface RenderedPage {
  html: string;
  /** The response headers the page must be served with. */
  headers: PageHeaders;
}

/** `&` first, or the entities the later replacements write get escaped twice. */
export const escapeHtml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/**
 * Render the page. `apiBaseUrl` undefined means endpoint-served: the script
 * derives its API base from its own URL, and `connect-src` is `'self'`.
 */
export function renderPage(branding: ResolvedBranding, apiBaseUrl?: string): RenderedPage {
  const style = stylesFor(branding.brandColor);
  const csp: CspInput = {
    script: PAGE_SCRIPT,
    style,
    connect: apiBaseUrl === undefined ? "'self'" : new URL(apiBaseUrl).origin,
    logoOrigin: branding.brandLogoUrl === undefined ? undefined : new URL(branding.brandLogoUrl).origin,
  };

  const brand =
    branding.brandName === undefined && branding.brandLogoUrl === undefined
      ? ""
      : `<header class="brand">` +
        (branding.brandLogoUrl === undefined
          ? ""
          : `<img src="${escapeHtml(branding.brandLogoUrl)}" alt="" referrerpolicy="no-referrer" width="32" height="32">`) +
        (branding.brandName === undefined ? "" : `<span>${escapeHtml(branding.brandName)}</span>`) +
        `</header>`;

  const meta = apiBaseUrl === undefined ? "" : `<meta http-equiv="Content-Security-Policy" content="${escapeHtml(cspMeta(csp))}">`;

  const html = [
    `<!doctype html>`,
    `<html lang="en">`,
    `<head>`,
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<meta name="referrer" content="no-referrer">`,
    `<meta name="robots" content="noindex">`,
    meta,
    `<title>Sign in</title>`,
    `<style>${style}</style>`,
    `</head>`,
    `<body data-api-base="${escapeHtml(apiBaseUrl ?? "")}" data-contract="${CONTRACT}" data-notice="${branding.sharedDomainNotice ? "1" : "0"}">`,
    `<main id="app">`,
    brand,
    `<noscript><p>JavaScript is required to sign in.</p></noscript>`,
    `<section id="view-loading"><h1 id="view-loading-heading" tabindex="-1">Loading…</h1></section>`,
    `<div id="request" class="request" hidden>`,
    `<div class="client"><img id="client-logo" alt="" width="28" height="28" hidden><span id="client-name"></span></div>`,
    `<dl>`,
    `<dt>Wants access to</dt><dd id="server-name"></dd>`,
    `<dt>Sends you back to</dt><dd id="callback-host"></dd>`,
    `<dt>Client</dt><dd id="client-status"></dd>`,
    `</dl>`,
    `<p id="unverified-warning" class="warning" hidden>This app is not verified. Only continue if you started this sign-in and recognize where it sends you back to.</p>`,
    `</div>`,
    `<section id="view-signin" hidden>`,
    `<h1 id="view-signin-heading" tabindex="-1">Sign in to continue</h1>`,
    `<form id="signin" method="post" action="#" autocomplete="on">`,
    `<label for="email">Email</label>`,
    `<input id="email" name="email" type="email" autocomplete="username" required>`,
    `<label for="password">Password</label>`,
    `<input id="password" name="password" type="password" autocomplete="current-password" required>`,
    `<div class="actions">`,
    `<button id="signin-submit" class="primary" type="submit">Sign in</button>`,
    `<button id="signin-cancel" type="button">Cancel</button>`,
    `</div>`,
    `<p id="signin-error" class="error" role="alert" aria-live="assertive"></p>`,
    `</form>`,
    `<p class="muted">No account? Contact the app's owner.</p>`,
    `</section>`,
    `<section id="view-consent" hidden>`,
    `<h1 id="view-consent-heading" tabindex="-1">Allow access?</h1>`,
    `<p class="muted">Signed in as <strong id="signed-in-as"></strong></p>`,
    `<div class="actions">`,
    `<button id="allow" class="primary" type="button">Allow</button>`,
    `<button id="deny" type="button">Deny</button>`,
    `<button id="switch-account" class="link" type="button">Use a different account</button>`,
    `</div>`,
    `<p id="consent-error" class="error" role="alert" aria-live="assertive"></p>`,
    `</section>`,
    `<section id="view-terminal" hidden>`,
    `<h1 id="view-terminal-heading" tabindex="-1"></h1>`,
    `<p id="terminal-text" aria-live="polite"></p>`,
    `<button id="terminal-retry" type="button" hidden>Try again</button>`,
    `</section>`,
    `<p id="shared-notice" class="notice" hidden>Developer notice: this page is served from a shared Xano instance domain. Serve it from your own domain in production.</p>`,
    `</main>`,
    `<script>${PAGE_SCRIPT}</script>`,
    `</body>`,
    `</html>`,
  ]
    .filter((line) => line !== "")
    .join("\n");

  return { html: `${html}\n`, headers: pageHeaders(csp) };
}
