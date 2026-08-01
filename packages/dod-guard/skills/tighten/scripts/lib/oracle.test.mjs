import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasOracle } from "./oracle.mjs";

// Each case names the one path it wants found. The search order stays private.
function only(wanted) {
  return (path) => path === wanted;
}

describe("hasOracle", () => {
  it("finds a sibling test file", () => {
    assert.equal(hasOracle("src/router.ts", only("src/router.test.ts")), true);
  });

  it("finds a sibling spec file", () => {
    assert.equal(hasOracle("src/router.ts", only("src/router.spec.ts")), true);
  });

  it("finds a test in a tests directory beside the file", () => {
    const probe = only("src/__tests__/router.test.ts");
    assert.equal(hasOracle("src/router.ts", probe), true);
  });

  it("keeps the extension of the source file", () => {
    assert.equal(hasOracle("lib/parse.mjs", only("lib/parse.test.mjs")), true);
    assert.equal(hasOracle("lib/parse.mjs", only("lib/parse.test.ts")), false);
  });

  it("searches with forward slashes whatever the input used", () => {
    const probe = only("src/deep/router.test.ts");
    assert.equal(hasOracle("src\\deep\\router.ts", probe), true);
  });

  it("is false when nothing matches", () => {
    assert.equal(hasOracle("src/router.ts", () => false), false);
  });

  it("is false for a file that cannot have a sibling test", () => {
    assert.equal(hasOracle("Makefile", () => true), false);
  });

  it("does not treat a dotfile as an extension", () => {
    assert.equal(hasOracle(".gitignore", () => true), false);
  });
});
