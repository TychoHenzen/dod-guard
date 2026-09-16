import {
  practiceCandidate,
  productionReference,
} from "./practice-candidate-fixture.js";
export const practiceCandidates = [
  practiceCandidate(["event", "OrderEvent", "src/events/order.ts", "type"], {
    references: [productionReference()],
    public_or_exported: true,
  }),
  practiceCandidate(
    ["service", "OrderService", "src/services/order.ts", "interface"],
    {
      references: [productionReference(), productionReference("lib/client.ts")],
      incoming_call_sites: ["app/consumer.ts:2"],
      public_or_exported: true,
    },
  ),
  practiceCandidate(["main", "main", "src/main.ts", "function"], {
    references: [productionReference("app/boot.ts")],
  }),
  practiceCandidate(["type", "Order", "src/domain/order.ts", "type"], {
    references: [productionReference()],
  }),
  practiceCandidate(
    ["action", "archiveOrder", "src/actions/archive.ts", "method"],
    { references: [productionReference()] },
  ),
  practiceCandidate(
    ["test", "TestHelper", "tests/helper.test.ts", "function"],
    {
      references: [{ path: "tests/helper.test.ts", content: "test" }],
    },
  ),
  practiceCandidate(["generated", "Order", "dist/order.js", "type"], {
    references: [productionReference()],
    generated_only: true,
  }),
  practiceCandidate(["unknown", "UnknownType", "src/unknown.ts", "type"], {
    references: [productionReference()],
  }),
  practiceCandidate(["tie-b", "TieB", "src/z.ts", "function"], {
    references: [productionReference()],
  }),
  practiceCandidate(["tie-a", "TieA", "src/a.ts", "function"], {
    references: [productionReference()],
  }),
];
