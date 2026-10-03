/**
 * The page's Content-Security-Policy and the response headers that go with it.
 *
 * Inline script and style are authorized by sha256 hash - no `unsafe-inline`,
 * no nonce (the page is static, so there is nothing per-request to bind one to).
 * Browsers hash inline content AFTER turning CRLF/CR into LF (verified live,
 * AGENTS.md), so the hash is taken over normalized text and the template is
 * kept LF-only anyway.
 */
import { createHash } from "node:crypto";

export const sha256Source = (content: string): string =>
  `'sha256-${createHash("sha256").update(content.replace(/\r\n?/g, "\n"), "utf8").digest("base64")}'`;

export interface CspInput {
  script: string;
  style: string;
  /** `'self'` when the page is endpoint-served; the API base origin when exported. */
  connect: string;
  /** The brand logo's origin, when there is one. */
  logoOrigin: string | undefined;
}

/** Every directive except `frame-ancestors`, which a `<meta>` CSP ignores. */
export const cspDirectives = (i: CspInput): string[] => [
  "default-src 'none'",
  `script-src ${sha256Source(i.script)}`,
  `style-src ${sha256Source(i.style)}`,
  // A verified client's logo comes from an https URL the platform has already
  // sanitized; the brand logo's origin is listed exactly. No wildcard, no data:.
  `img-src ${i.logoOrigin === undefined ? "" : `${i.logoOrigin} `}https:`,
  `connect-src ${i.connect}`,
  // Nothing on this page is ever submitted natively: if the script did not
  // run, a form submit would otherwise put the password in a URL.
  "form-action 'none'",
  "base-uri 'none'",
];

/** The header CSP: everything, plus `frame-ancestors 'none'` so the consent screen cannot be framed. */
export const cspHeader = (i: CspInput): string => [...cspDirectives(i), "frame-ancestors 'none'"].join("; ");

/** The `<meta http-equiv>` CSP for an exported page, for hosts that cannot set headers. */
export const cspMeta = (i: CspInput): string => cspDirectives(i).join("; ");

/** The response headers the page must be served with, in both modes. */
export interface PageHeaders {
  "Content-Type": string;
  "Content-Security-Policy": string;
  "X-Frame-Options": string;
  "Referrer-Policy": string;
  "Cache-Control": string;
  "X-Content-Type-Options": string;
}

export const pageHeaders = (i: CspInput): PageHeaders => ({
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy": cspHeader(i),
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
});
