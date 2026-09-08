export interface RawAnalyzeOptions {
  readonly days?: string;
  readonly gapHours?: string;
  readonly threshold?: string;
  readonly format?: string;
  readonly extensions?: string;
  readonly untrackedAge?: string;
  readonly exclude?: string;
  readonly verbose?: boolean;
}
