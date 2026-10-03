/**
 * The wire contract between the page and the endpoints it calls.
 *
 * An exported page is frozen at the module version that rendered it, while the
 * endpoints change whenever the consumer upgrades and redeploys. The page sends
 * nothing until `mcp_oauth/request` answers with the contract it was built for,
 * so a stale export stops before anyone types a password.
 *
 * Bump this ONLY when a route, an input or a response shape the page relies on
 * changes, and say "re-export required" in that release's notes. The
 * `mcp_oauth/request` route and its `contract` field are themselves frozen for
 * 1.x, because they are what carries the check.
 */
export const CONTRACT = 1;
