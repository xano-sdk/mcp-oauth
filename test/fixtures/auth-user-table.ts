/**
 * The shape of `@xano-sdk/auth`'s `userTable`, copied rather than imported:
 * this module must not depend on another module. Its authored schema declares
 * no `id` or `created_at` (both are system columns the SDK injects), which is
 * exactly the case the options gate must accept.
 */
import { f, table } from "@xano/sdk";

export const userTable = table({
  name: "user",
  auth: true,
  useXdo: false,
  schema: {
    name: f.text({ required: true, methods: ["trim"] }),
    email: f.email({ required: true, nullable: true, methods: ["trim", "lower"] }),
    password: f.password({ required: true, nullable: true, methods: ["min:8", "minAlpha:1", "minDigit:1"] }),
    role: f.enum(["admin", "member"]),
  },
  index: [{ type: "btree|unique", fields: [{ name: "email", op: "asc" }] }],
});
