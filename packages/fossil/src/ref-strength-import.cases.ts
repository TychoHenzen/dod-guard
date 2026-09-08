import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeJavaScriptReferences } from "./ref-analyzer.js";

test(
  "keeps an ordinary imported candidate use as a " + "strong inbound reference",
  () => {
    const graph = analyzeJavaScriptReferences([
      {
        path: "src/live.ts",
        language: "typescript",
        content:
          'import { candidate } from "./candidate";\n' +
          "export const result = candidate();\n",
      },
      {
        path: "src/candidate.ts",
        language: "typescript",
        content: "export const candidate = () => true;\n",
      },
    ]);

    assert.deepEqual(
      graph.edges.map(({ sourcePath, targetPath, strength }) => ({
        sourcePath,
        targetPath,
        strength,
      })),
      [
        {
          sourcePath: "src/live.ts",
          targetPath: "src/candidate.ts",
          strength: "strong",
        },
      ],
    );
  },
);

test("marks imports used only in balanced try or catch bodies as weak", () => {
  const graph = analyzeJavaScriptReferences([
    {
      path: "src/try-only.ts",
      language: "typescript",
      content:
        'import { candidate } from "./candidate";\n' +
        'try {\n  if (true) { candidate("}"); } // }\n}\n',
    },
    {
      path: "src/catch-only.ts",
      language: "typescript",
      content:
        'import { candidate } from "./candidate";\n' +
        "try { throw Error(); } catch (error /* a deliberately " +
        "long comment before the body opens */) {\n" +
        "  candidate(error);\n}\n",
    },
    {
      path: "src/multiple-bindings.ts",
      language: "typescript",
      content:
        'import defaultCandidate, * as candidates from "./candidate";\n' +
        "import { candidate as aliasedCandidate, anotherCandidate } from " +
        '"./candidate";\n' +
        "try {\n  defaultCandidate();\n  candidates.run();\n" +
        "} catch (error /* a deliberately " +
        "long comment before the body opens */) {\n" +
        "  aliasedCandidate(error);\n  anotherCandidate(error);\n}\n",
    },
    {
      path: "src/dollar-binding.ts",
      language: "typescript",
      content:
        'import { candidate as $candidate } from "./candidate";\n' +
        "try { $candidate(); } catch {}\n",
    },
    { path: "src/candidate.ts", language: "typescript", content: "" },
  ]);

  assert.deepEqual(
    graph.edges.map((edge) => edge.strength),
    ["weak", "weak", "weak", "weak", "weak"],
  );
});
