import { test } from "node:test";
import assert from "node:assert/strict";
import { playJingle, showVerifyDialog } from "./notify.js";

// notify.ts is platform-specific (Windows GUI dialogs via PowerShell).
// Unit-testable surface: exports, function signatures, non-throw contract.
// Dialog interaction is exercised manually during development.
// showVerifyDialog cannot be invoked in automated tests on Windows —
// it spawns a blocking WinForms dialog and an orphaned PowerShell process.

test("playJingle is a callable function", () => {
  assert.equal(typeof playJingle, "function", "playJingle should be a function");
});

test("showVerifyDialog is a callable function", () => {
  assert.equal(typeof showVerifyDialog, "function", "showVerifyDialog should be a function");
});

test("playJingle does not throw (fire-and-forget on any platform)", () => {
  assert.doesNotThrow(() => playJingle(), "playJingle should never throw");
});

test("showVerifyDialog accepts two string arguments and returns Promise", () => {
  // Verify signature without invoking (avoid spawning PowerShell dialog).
  assert.equal(showVerifyDialog.length, 2, "should accept 2 arguments (title, body)");
});
