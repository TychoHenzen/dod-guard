import assert from "node:assert/strict";
import test from "node:test";
import { godotWindowRemainder } from "./godot-window-rows.mjs";

const row = (expected, extra = {}) => ({ id: "R1", proof: "proof-1", expected, status: "pending", ...extra });
const flagged = (expected, extra) => godotWindowRemainder([row(expected, extra)]).length > 0;

const ASKS = [
  "windowed screenshot of the shelf",
  "a manual run of the shop scene",
  "godot --write-movie out.avi",
  "the game opens a window and clicks",
  "manually checks the cursor",
  "screenshots/ folder holds one png",
];
const HEADLESS = [
  "scripted input through ParseInputEvent; mouse mode is captured",
  "set GetTree().Root.Size to the window size, then assert the layout",
  "headless, no window opens",
  "headless, no screenshot is taken",
  "scripted input, not a manual run",
  "without a screenshot",
  "Windows path handling is unchanged",
];

test("flags a row that asks for a window, screenshot, movie capture, or manual run", () => {
  for (const text of ASKS) assert.equal(flagged(text), true, text);
});

test("passes a headless row, including phrasings that mention a window or negate the ask", () => {
  for (const text of HEADLESS) assert.equal(flagged(text), false, text);
});

test("names the row and every ask", () => {
  const fix = "make it checkable headless, or move the judgement to an owner note";
  assert.deepEqual(godotWindowRemainder([row("windowed screenshot")]), [
    `planned acceptance row R1 asks for a windowed run and a screenshot in a Godot project; ${fix}`,
  ]);
});

test("reads the proof text, skips an inapplicable row, and tolerates input that is not a row list", () => {
  assert.equal(godotWindowRemainder([{ id: "R2", proof: "manual run", expected: "x", status: "pending" }]).length, 1);
  assert.equal(flagged("windowed", { status: "inapplicable", reason: "no window" }), false);
  assert.deepEqual(godotWindowRemainder([]), []);
  assert.deepEqual(godotWindowRemainder(undefined), []);
  assert.deepEqual(godotWindowRemainder([null, "windowed"]), []);
});
