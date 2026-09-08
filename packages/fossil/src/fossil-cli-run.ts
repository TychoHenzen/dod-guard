import { FossilUsageError } from "./fossil-cli-types/fossil-usage-error.js";
import { createFossilProgram } from "./fossil-cli-program.js";
import type { FossilCliDependencies } from "./fossil-cli-types/fossil-cli-dependencies.js";

/** Parses a CLI argument vector through the injected analysis command boundary. */
export async function runFossilCli(argv: readonly string[], dependencies: FossilCliDependencies): Promise<void> {
  const stderr = dependencies.stderr ?? process.stderr.write.bind(process.stderr);
  const program = createFossilProgram({ ...dependencies, stderr });
  try {
    await program.parseAsync([...argv], { from: "node" });
  } catch (error) {
    if (!(error instanceof FossilUsageError)) throw error;
    const analyzeCommand = program.commands.find((command) => command.name() === "analyze");
    if (!error.reported)
      stderr(`error: ${error.message}\n${analyzeCommand?.helpInformation() ?? program.helpInformation()}`);
    throw error;
  }
}
