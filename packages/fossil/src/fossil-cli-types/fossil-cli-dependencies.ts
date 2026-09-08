import type { AnalyzeCommandHandler } from "./analyze-command-handler.js";

export interface FossilCliDependencies {
  readonly analyze: AnalyzeCommandHandler;
  readonly cwd?: () => string;
  readonly stderr?: (message: string) => void;
  readonly stdout?: (message: string) => void;
}
