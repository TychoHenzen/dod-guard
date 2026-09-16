export const searchReplies = {
  "": {
    schema_version: 1,
    state: "ready",
    data: {
      landmarks: [
        {
          group: "entry_points",
          symbols: [
            {
              symbol_id: "symbol-main",
              name: "main",
              path: "src/main.ts",
              kind: "function",
            },
          ],
        },
      ],
    },
  },
  main: {
    schema_version: 1,
    state: "ready",
    data: {
      candidates: [
        {
          type: "symbol",
          identity: "symbol-main",
          name: "main",
          match_class: "exact",
          match_score: 100,
          path: "src/main.ts",
          kind: "function",
        },
      ],
    },
  },
  client: {
    schema_version: 1,
    state: "ready",
    data: {
      candidates: [
        {
          type: "file",
          identity: "file:src/browser/client.ts",
          match_class: "exact",
          match_score: 100,
          path: "src/browser/client.ts",
        },
      ],
    },
  },
};
