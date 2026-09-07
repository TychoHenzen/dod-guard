import assert from "node:assert/strict";
import { it } from "node:test";
import { matchDiscoveryCandidates } from "../../../discovery/matcher.js";

it(
  "normalizes slash variants and dot segments without " +
    "allowing path traversal",
  () => {
    const [result] = matchDiscoveryCandidates("demo", [
      { type: "file", path: "./src//nested/../Demo.cs", identity: "safe" },
    ]);
    assert.equal(result, undefined);

    const [normalized] = matchDiscoveryCandidates("demo", [
      { type: "file", path: "./src//./Demo.cs", identity: "normalized" },
    ]);
    assert.equal(normalized?.path, "src/Demo.cs");
    assert.deepEqual(
      matchDiscoveryCandidates("demo", [
        { type: "file", path: "/src/Demo.cs", identity: "posix-absolute" },
        {
          type: "file",
          path: "C:\\src\\Demo.cs",
          identity: "windows-absolute",
        },
        { type: "file", path: "src/../Demo.cs", identity: "traversal" },
      ]),
      [],
    );
  },
);
it(
  "rejects absolute, drive-relative, UNC, and URI-like " + "backend paths",
  () => {
    assert.deepEqual(
      matchDiscoveryCandidates("demo", [
        {
          type: "file",
          path: "C:\\src\\Demo.cs",
          identity: "windows-absolute",
        },
        { type: "file", path: "C:Demo.cs", identity: "windows-drive-relative" },
        { type: "file", path: "\\\\server\\share\\Demo.cs", identity: "unc" },
        { type: "file", path: "file:///tmp/Demo.cs", identity: "file-uri" },
        { type: "file", path: "scheme:Demo.cs", identity: "scheme-like" },
      ]),
      [],
    );

    assert.equal(
      matchDiscoveryCandidates("demo", [
        { type: "file", path: "src/Demo.cs", identity: "portable" },
      ])[0]?.path,
      "src/Demo.cs",
    );
  },
);
