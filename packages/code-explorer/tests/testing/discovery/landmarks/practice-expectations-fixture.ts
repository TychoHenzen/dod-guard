function unavailableSymbol(symbol_id: string) {
  return {
    symbol_id,
    score: 5,
    production_reference_files: 1,
    incoming_call_sites: 0,
    public_or_exported: false,
    visibility_source: "unavailable",
  };
}

export const expectedPracticeGroups = [
  {
    group: "messages_or_events",
    symbols: [
      {
        symbol_id: "event",
        score: 10,
        production_reference_files: 1,
        incoming_call_sites: 0,
        public_or_exported: true,
        visibility_source: "semantic_visibility",
      },
    ],
  },
  {
    group: "services",
    symbols: [
      {
        symbol_id: "service",
        score: 19,
        production_reference_files: 2,
        incoming_call_sites: 1,
        public_or_exported: true,
        visibility_source: "semantic_visibility",
      },
    ],
  },
  { group: "entry_points", symbols: [unavailableSymbol("main")] },
  {
    group: "types",
    symbols: [unavailableSymbol("type"), unavailableSymbol("unknown")],
  },
  {
    group: "common_actions",
    symbols: [
      unavailableSymbol("tie-a"),
      unavailableSymbol("action"),
      unavailableSymbol("tie-b"),
    ],
  },
];
