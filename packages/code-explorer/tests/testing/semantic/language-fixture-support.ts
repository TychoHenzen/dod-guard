export type FixtureManifest = {
  schema_version: 1;
  language: "rust" | "python" | "csharp";
  source_file: string;
  symbols: {
    entry: {
      identity: string;
      name: string;
      declaration: {
        start: { line: number; character: number };
        end: { line: number; character: number };
      };
    };
    helper: {
      identity: string;
      name: string;
      declaration: {
        start: { line: number; character: number };
        end: { line: number; character: number };
      };
      body: string;
    };
  };
  relations: {
    definition: {
      from_call: {
        start: { line: number; character: number };
        end: { line: number; character: number };
      };
      target: {
        start: { line: number; character: number };
        end: { line: number; character: number };
      };
    };
    callers: {
      target: string;
      callers: Array<{
        identity: string;
        call_site: {
          start: { line: number; character: number };
          end: { line: number; character: number };
        };
      }>;
    };
    callees: {
      source: string;
      callees: Array<{
        identity: string;
        call_site: {
          start: { line: number; character: number };
          end: { line: number; character: number };
        };
      }>;
    };
  };
  unavailable_relations: Array<{
    relation: string;
    reason: string;
  }>;
};
