export interface SyntaxView {
  readonly code: string;
  readonly comments: readonly { start: number; end: number; text: string }[];
}
