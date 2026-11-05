// The workspace `npm run test:live` deploys. `live/user` exists only here: it stands in for the app's own sign-up.
// `whoami` is the tool the check calls after signing in, to prove the call runs as that person.
import { apiGroup, auth, f, inp, input, mcpServer, query, ref, s, table, tool, workspace, workspaceConfig } from "@xano/sdk";
import { registerMcpOauth } from "../../src/index.js";

const user = table({
  name: "live_user",
  auth: true,
  useXdo: false,
  schema: { email: f.email({ required: true }), password: f.password({ required: true }) },
  index: [{ type: "unique", fields: [{ name: "email" }] }],
});
const live = apiGroup({ name: "Live", canonical: "live" });
const app = workspace("mcp-oauth-live")
  .registerWorkspace(workspaceConfig({ name: "mcp-oauth-live", env: { MCP_OAUTH_LOGIN_URL: "" } }))
  .registerTables([user])
  .registerApiGroups([live]);
const mcpOauth = registerMcpOauth(app, { authTable: user, canonical: "mcp-oauth-live" });

const addUser = query({
  name: "live/user",
  verb: "POST",
  apiGroup: live,
  input: { email: input.email({ required: true }), password: input.text({ required: true }) },
  stack: [s.db.add({ table: user, row: { email: inp("email"), password: inp("password") }, as: "row" })],
  response: { id: ref("row.id") },
});
const whoami = tool({
  name: "whoami",
  description: "Returns the id of the person who connected.",
  stack: [s.set_var("me", auth("id"))],
  response: ref("me"),
});

export default app
  .registerQueries([addUser])
  .registerTools([whoami])
  .registerMcpServers([mcpServer({ name: "live-mcp", canonical: "live-mcp", tools: [{ tool: whoami, auth: user }], oauth: mcpOauth.oauth })]);
