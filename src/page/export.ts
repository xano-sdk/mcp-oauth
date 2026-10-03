/**
 * `exportLoginPage` - the same page, rendered for hosting on your own domain.
 *
 * In production the page should not run on a shared Xano instance domain,
 * where it shares an origin with every other workspace on that instance. Render
 * it here, host the HTML on your domain with the returned headers, and point
 * `MCP_OAUTH_LOGIN_URL` at it. The page then calls this module's endpoints
 * cross-origin (the API group's default CORS allows it).
 */
import { failer, resolveBranding, type BrandingOptions } from "../options.js";
import { renderPage, type RenderedPage } from "./template.js";

export interface ExportLoginPageOptions extends BrandingOptions {
  /**
   * The module's API group base: `https://<host>/api:<canonical>`, plus the
   * `/tenant/<name>` path segment first when the backend is a tenant
   * (`https://<host>/tenant/<name>/api:<canonical>`). https only.
   */
  apiBaseUrl: string;
}

const fail = failer("exportLoginPage");

/**
 * Render the login page for your own host. Returns the HTML and the headers
 * to serve it with. A host that cannot set headers still gets most of them via
 * `<meta>`, and a frame-buster stands in for `frame-ancestors`.
 */
export function exportLoginPage(options: ExportLoginPageOptions): RenderedPage {
  if (options === null || typeof options !== "object") fail("expected `{ apiBaseUrl, ... }`.");
  const raw = options.apiBaseUrl;
  if (typeof raw !== "string" || raw.trim() === "") fail("`apiBaseUrl` is required: the module's API group base URL.");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return fail(`\`apiBaseUrl\` "${raw}" is not an absolute URL.`);
  }
  if (url.protocol !== "https:") fail(`\`apiBaseUrl\` "${raw}" must be https: the page sends a password to it.`);
  if (url.search !== "" || url.hash !== "") fail(`\`apiBaseUrl\` "${raw}" must not carry a query string or fragment.`);
  if (!/\/api:[A-Za-z0-9_-]+\/?$/.test(url.pathname)) {
    fail(`\`apiBaseUrl\` "${raw}" must end in the group's \`/api:<canonical>\` segment, e.g. https://x.xano.io/api:mcp-oauth-my-app.`);
  }
  const base = `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  const branding = resolveBranding(options, "exportLoginPage");
  return renderPage(branding, base);
}
