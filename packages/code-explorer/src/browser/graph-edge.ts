export type GraphEdge = {
  from: string;
  to: string;
  label:
    | "definition"
    | "reference"
    | "caller"
    | "callee"
    | "type"
    | "implementation";
};
