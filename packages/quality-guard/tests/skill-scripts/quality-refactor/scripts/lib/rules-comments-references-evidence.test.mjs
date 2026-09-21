import assert from "node:assert/strict";
import { test } from "node:test";
import { run } from "./rules-comments-references-support.mjs";

test("keeps unreadable see evidence unavailable", () => {
  const found = run("// @see src/target.ts#Target\nexport const value = 1;\n", {
    "src/target.ts": Buffer.from([0, 1, 2]),
  });
  assert.deepEqual(found, []);
});

test("does not treat target comments or strings as symbol evidence", () => {
  for (const [extension, marker, declaration] of [
    [".cs", "//", '// Target\npublic class Other {}\nconst string Text = "Target";'],
    [".py", "#", '# Target\nclass Other:\n    pass\ntext = "Target"\n'],
    [".rs", "///", '// Target\npub struct Other;\nconst TEXT: &str = "Target";'],
    [".ts", "//", '// Target\nexport class Other {}\nconst text = "Target";'],
  ]) {
    const found = run(
      `${marker} @see src/target${extension}#Target\nexport const value = 1;\n`,
      { [`src/target${extension}`]: declaration },
      extension,
    );
    assert.equal(found.length, 1, extension);
  }
});

test("finds explicit tags on later lines of a block comment", () => {
  const found = run(
    "/**\n * protocol note\n * @see src/missing.ts#Missing\n */\nexport const value = 1;\n",
  );
  assert.equal(found.length, 1);
  assert.equal(found[0].line, 3);
});
