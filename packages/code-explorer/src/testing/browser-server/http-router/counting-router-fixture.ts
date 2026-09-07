import { BrowserHttpRouter } from "../../../browser-server/http-router.js";
import { origin } from "./origin-fixture.js";
export function countingRouter() {
  let calls = 0;
  const router = new BrowserHttpRouter({
    origin,
    call: async () => {
      calls += 1;
      return { schema_version: 1 };
    },
  });
  return { router, calls: () => calls };
}
