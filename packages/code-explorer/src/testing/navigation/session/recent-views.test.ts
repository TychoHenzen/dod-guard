import assert from "node:assert/strict";
import { it } from "node:test";
import { SessionManager } from "../../../navigation/session.js";
import { view } from "./view.js";

it("lists only bounded recent views from its own session", () => {
  const sessions = new SessionManager();
  const one = sessions.start("one");
  const two = sessions.start("two");
  const first = view();
  const second = view();
  const other = view();
  sessions.addView("one", one, first);
  sessions.addView("one", one, second);
  sessions.addView("two", two, other);
  assert.deepEqual(
    sessions.recent("one", one, 1)?.map((candidate) => candidate.view_id),
    [second.view_id],
  );
});
