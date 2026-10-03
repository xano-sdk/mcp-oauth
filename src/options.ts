/**
 * Public options, and the single gate every one of them passes through.
 *
 * ALL validation lives here, and it runs BEFORE any def is built. A check
 * scattered into a def factory runs at a point where the error cannot name
 * which option was wrong - the consumer gets a stack trace through the encoder
 * instead of a sentence naming their mistake.
 */
import { env } from "@xano/sdk";
import type { TableDef, Value } from "@xano/sdk";

/**
 * Is this a tagged `Value` - `env("MCP_OAUTH_LOGIN_URL")` - rather than a plain
 * string? Structural, because core does not export `isTaggedValue`. Every
 * tagged value carries a string `tag`; nothing a consumer would pass as a URL does.
 */
const isRuntimeValue = (v: unknown): v is Value =>
  typeof v === "object" && v !== null && typeof (v as { tag?: unknown }).tag === "string";

/** How many sign-in attempts one key may make in a window. `false` turns the limiter OFF. */
export interface RateLimitOptions {
  /** Attempts allowed per window. */
  max: number;
  /** Window length, in seconds. */
  ttl: number;
}

/** What a consumer passes to {@link registerMcpOauth}. */
export interface McpOauthOptions {
  /**
   * The auth table whose row a sign-in resolves to - the same table the MCP
   * server's `oauth.authTable` names, which is why it is passed once, here, and
   * the returned `oauth` block carries it. The platform refuses to complete a
   * sign-in whose session belongs to any other table.
   *
   * Pass the def handle (`@xano-sdk/auth`'s `userTable`, or your own
   * `table({ auth: true })`), never a bare name.
   */
  authTable: TableDef;

  /** Column on `authTable` holding the address. Default `"email"`. */
  emailColumn?: string;

  /** Column on `authTable` holding the hash. Default `"password"`. Must be `f.password()`. */
  passwordColumn?: string;

  /**
   * A boolean column that must be `true` for a user to sign in - your
   * "disabled" switch, honored here. Unset, every row with a password can sign in.
   *
   * ⚠ This is the only one of your login rules the module can see. Email
   * verification, MFA, or anything else your own login endpoint enforces is NOT
   * applied by `mcp_oauth/sign_in`, and the token it mints is a real session on
   * `authTable` for 600 seconds. See the README, "Read before production".
   */
  activeColumn?: string;

  /**
   * Where the platform sends a client to sign in. Default
   * `env("MCP_OAUTH_LOGIN_URL")`, read per environment when a request arrives,
   * so one release serves every environment and the URL can be set after the
   * host exists (`xanosdk env set MCP_OAUTH_LOGIN_URL`).
   *
   * Point it at this module's own page (`https://<host>/api:<canonical>/mcp_oauth/login`)
   * or at the page you exported with `exportLoginPage` and host yourself.
   * A literal string must be an absolute `https:` URL.
   */
  loginUrl?: string | Value;

  /**
   * The API group's public URL segment. Default `mcp-oauth-<workspace name>`.
   *
   * Pinned on purpose, unlike most modules: the login URL lives in an env
   * value, so the segment must not change under it. A canonical is unique per
   * INSTANCE, across every workspace on it - if a deploy reports this one as a
   * conflict, pass your own and rebuild the login URL from it.
   */
  canonical?: string;

  /** A product name shown at the top of the page. Omitted when unset. */
  brandName?: string;

  /**
   * The accent colour, as a hex value. Default `"#2563eb"`. It is written into
   * the page's stylesheet, so it is validated rather than trusted. White is the
   * button's text colour, so pick something with contrast.
   */
  brandColor?: string;

  /** A logo shown above the product name. An absolute `https:` URL; its origin is added to the page's CSP. */
  brandLogoUrl?: string;

  /**
   * Show a small developer-facing notice when the page runs on a shared Xano
   * instance domain (`*.xano.io`). Default `true`.
   *
   * On a shared instance domain the page shares an origin with every other
   * workspace on that instance. The notice says so, and says to serve the
   * exported page from your own domain in production.
   */
  sharedDomainNotice?: boolean;

  /**
   * Rate limit on `mcp_oauth/sign_in`, per IP and per email, or `false` to
   * remove it. Default {@link DEFAULT_RATE_LIMIT}.
   */
  rateLimit?: RateLimitOptions | false;

  /**
   * Capture request bodies in the workspace's request history. Default OFF:
   * `sign_in` carries a plaintext password and `complete` a bearer token.
   */
  history?: boolean;
}

/** The options with every default applied. Defs are built from THIS, never from the raw input. */
export interface ResolvedMcpOauthOptions extends ResolvedBranding {
  authTable: TableDef;
  emailColumn: string;
  passwordColumn: string;
  activeColumn: string | undefined;
  loginUrl: string | Value;
  canonical: string;
  rateLimit: RateLimitOptions | false;
  history: boolean;
}

/** Context only the register call knows. */
export interface ResolveContext {
  /** The consumer workspace's name, which the default canonical is built from. */
  workspaceName: string | undefined;
}

/**
 * The alphabet the engine's own canonicals use (url-safe). Anything outside it
 * lands in a URL path unescaped and produces a broken endpoint.
 */
const CANONICAL_PATTERN = /^[A-Za-z0-9_-]+$/;

/** `#rgb` or `#rrggbb`. */
const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * The default limiter: five attempts per IP and per email in a window no
 * longer than the ten minutes a sign-in request lives. Anyone who knows an
 * email can spend its five attempts, and can keep doing so every window, which
 * keeps that address out of MCP sign-in while they do. The README says so.
 */
export const DEFAULT_RATE_LIMIT: RateLimitOptions = { max: 5, ttl: 600 };

export const DEFAULT_LOGIN_URL_ENV = "MCP_OAUTH_LOGIN_URL";

/**
 * The default accent. A mid-tone, because the page follows the reader's light
 * or dark scheme: a near-black accent (the email-module default) leaves the
 * primary button invisible on the dark card.
 */
export const DEFAULT_BRAND_COLOR = "#2563eb";

type Fail = (message: string) => never;

/** A thrower that prefixes its messages with the public function the caller called. */
export const failer =
  (owner: string): Fail =>
  (message) => {
    throw new Error(`${owner}: ${message}`);
  };

const fail = failer("registerMcpOauth");

const requireIdentifier = (value: unknown, option: string, f: Fail = fail): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    f(`\`${option}\` must be a non-empty string when passed.`);
  }
  return value as string;
};

const requireBoolean = (value: unknown, option: string, why: string, f: Fail = fail): void => {
  if (value !== undefined && typeof value !== "boolean") f(`\`${option}\` must be a boolean. ${why}`);
};

/** `"My App"` → `"my-app"`: the canonical alphabet, lower-cased, runs collapsed. */
export const slug = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");

/**
 * The authored schema, normalised to name → field, or `null` when it cannot be
 * read. `table({ schema })` takes a `FieldMap` record (the normal form) or a raw
 * `ColumnDef[]`; anything else is skipped rather than guessed at.
 */
const schemaOf = (authTable: TableDef): Record<string, { type?: unknown }> | null => {
  const schema: unknown = (authTable as { schema?: unknown }).schema;
  if (Array.isArray(schema)) {
    const out: Record<string, { type?: unknown }> = {};
    for (const column of schema) {
      const name = (column as { name?: unknown }).name;
      if (typeof name !== "string") return null;
      out[name] = column as { type?: unknown };
    }
    return out;
  }
  if (schema !== null && typeof schema === "object") return schema as Record<string, { type?: unknown }>;
  return null;
};

const typeOf = (schema: Record<string, { type?: unknown }>, column: string): string | null => {
  const type = schema[column]?.type;
  return typeof type === "string" ? type : null;
};

function checkUrl(option: string, value: string, why: string, f: Fail = fail): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return f(`\`${option}\` "${value}" is not an absolute URL. ${why}`);
  }
  if (parsed.protocol !== "https:") {
    f(`\`${option}\` "${value}" uses the "${parsed.protocol}" scheme; only https is accepted. ${why}`);
  }
}

/** The options that only shape the page, shared by {@link resolveOptions} and `exportLoginPage`. */
export type BrandingOptions = Pick<McpOauthOptions, "brandName" | "brandColor" | "brandLogoUrl" | "sharedDomainNotice">;

export interface ResolvedBranding {
  brandName: string | undefined;
  brandColor: string;
  brandLogoUrl: string | undefined;
  sharedDomainNotice: boolean;
}

export function resolveBranding(options: BrandingOptions, owner = "registerMcpOauth"): ResolvedBranding {
  const f = failer(owner);
  const brandColor = options.brandColor ?? DEFAULT_BRAND_COLOR;
  if (typeof brandColor !== "string" || !HEX_COLOR_PATTERN.test(brandColor)) {
    f(
      `\`brandColor\` "${String(brandColor)}" is not a hex colour (#rgb or #rrggbb). It is written into the ` +
        "page's stylesheet, so an arbitrary string would break the page rather than restyle it.",
    );
  }
  if (options.brandName !== undefined) requireIdentifier(options.brandName, "brandName", f);
  if (options.brandLogoUrl !== undefined) {
    if (typeof options.brandLogoUrl !== "string") f("`brandLogoUrl` must be an https URL string.");
    checkUrl("brandLogoUrl", options.brandLogoUrl, "Its origin is added to the page's Content-Security-Policy.", f);
  }
  requireBoolean(options.sharedDomainNotice, "sharedDomainNotice", "It decides whether the page shows its shared-domain notice.", f);
  return {
    brandName: options.brandName,
    brandColor,
    brandLogoUrl: options.brandLogoUrl,
    sharedDomainNotice: options.sharedDomainNotice ?? true,
  };
}

export function resolveOptions(options: McpOauthOptions, ctx: ResolveContext): ResolvedMcpOauthOptions {
  if (options === null || typeof options !== "object") fail("expected an options object: `{ authTable }`.");
  if (options.authTable === undefined || options.authTable === null) {
    fail(
      "`authTable` is required: the auth table a sign-in resolves to, and the same one the MCP server's " +
        "`oauth` block names. Pass its def handle - a bare table NAME cannot be resolved to a guid.",
    );
  }

  const emailColumn = options.emailColumn === undefined ? "email" : requireIdentifier(options.emailColumn, "emailColumn");
  const passwordColumn =
    options.passwordColumn === undefined ? "password" : requireIdentifier(options.passwordColumn, "passwordColumn");
  const activeColumn = options.activeColumn === undefined ? undefined : requireIdentifier(options.activeColumn, "activeColumn");

  const schema = schemaOf(options.authTable);
  if (schema !== null) {
    const system = (options.authTable as { system?: unknown }).system !== false;
    // `id` and `created_at` are injected onto every system table and are absent
    // from the authored schema, so they are legal targets that are not listed.
    const legal = [...Object.keys(schema), ...(system ? ["id", "created_at"] : [])];
    const wrong = ([
      ["emailColumn", emailColumn],
      ["passwordColumn", passwordColumn],
      ...(activeColumn === undefined ? [] : [["activeColumn", activeColumn] as const]),
    ] as const).filter(([, column]) => !legal.includes(column));
    if (wrong.length > 0) {
      const named = wrong.map(([option, column]) => `\`${option}\` "${column}"`).join(" and ");
      fail(
        `${named} ${wrong.length > 1 ? "are not columns" : "is not a column"} of the \`authTable\` you passed ` +
          `("${String((options.authTable as { name?: unknown }).name)}"). Its columns are: ${legal.join(", ")}.`,
      );
    }

    const passwordType = typeOf(schema, passwordColumn);
    if (passwordType !== null && passwordType !== "password") {
      fail(
        `\`passwordColumn\` "${passwordColumn}" is an \`f.${passwordType}()\` column, not \`f.password()\`. ` +
          "Sign-in checks the submitted password against a HASH, so a plain column could never match - " +
          "and storing passwords in one is its own problem.",
      );
    }

    if (activeColumn !== undefined) {
      const activeType = typeOf(schema, activeColumn);
      if (activeType !== null && activeType !== "bool") {
        fail(
          `\`activeColumn\` "${activeColumn}" is an \`f.${activeType}()\` column, not \`f.bool()\`. ` +
            "Sign-in requires it to be true, which only a boolean column can be.",
        );
      }
    }

    if (!legal.includes("created_at")) {
      fail(
        `the \`authTable\` ("${String((options.authTable as { name?: unknown }).name)}") has no \`created_at\` ` +
          "column. The platform identifies the signed-in row by its id AND created_at, and refuses the sign-in " +
          "without it. Declare `created_at` or drop `system: false`.",
      );
    }
  }

  let loginUrl: string | Value = env(DEFAULT_LOGIN_URL_ENV);
  if (options.loginUrl !== undefined) {
    if (isRuntimeValue(options.loginUrl)) {
      loginUrl = options.loginUrl;
    } else if (typeof options.loginUrl === "string") {
      checkUrl("loginUrl", options.loginUrl, "The platform redirects the user's browser to it.");
      loginUrl = options.loginUrl;
    } else {
      fail('`loginUrl` must be an https URL string or `env("NAME")`.');
    }
  }

  let canonical: string;
  if (options.canonical !== undefined) {
    canonical = requireIdentifier(options.canonical, "canonical");
    if (!CANONICAL_PATTERN.test(canonical)) {
      fail(
        `\`canonical\` "${canonical}" has characters outside [A-Za-z0-9_-]. It becomes a URL path segment, ` +
          "so anything else deploys a broken endpoint.",
      );
    }
  } else {
    const base = ctx.workspaceName === undefined ? "" : slug(ctx.workspaceName);
    if (base === "") {
      fail(
        "pass `canonical`: there is no workspace name to build the default (`mcp-oauth-<workspace name>`) from. " +
          "The login URL is built from this segment, so it must be known before deploy.",
      );
    }
    canonical = `mcp-oauth-${base}`;
  }

  const branding = resolveBranding(options);
  requireBoolean(
    options.history,
    "history",
    "It decides whether request BODIES are stored - here a plaintext password and a bearer token - so an " +
      "unrecognised value must not fall through to the engine's inherit-on default.",
  );

  let rateLimit: RateLimitOptions | false = DEFAULT_RATE_LIMIT;
  if (options.rateLimit !== undefined) {
    if (options.rateLimit === false) {
      rateLimit = false;
    } else if (
      typeof options.rateLimit !== "object" ||
      options.rateLimit === null ||
      !Number.isInteger(options.rateLimit.max) ||
      !Number.isInteger(options.rateLimit.ttl)
    ) {
      fail("`rateLimit` must be `{ max, ttl }` with whole numbers, or `false` to remove the limiter.");
    } else if (options.rateLimit.max < 1 || options.rateLimit.ttl < 1) {
      fail(
        `\`rateLimit\` needs \`max\` and \`ttl\` of at least 1 (got max=${options.rateLimit.max}, ` +
          `ttl=${options.rateLimit.ttl}). A zero window is not "no limit", it rejects every sign-in.`,
      );
    } else {
      rateLimit = { max: options.rateLimit.max, ttl: options.rateLimit.ttl };
    }
  }

  return {
    authTable: options.authTable,
    emailColumn,
    passwordColumn,
    activeColumn,
    loginUrl,
    canonical,
    ...branding,
    rateLimit,
    history: options.history ?? false,
  };
}
