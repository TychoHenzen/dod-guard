import { FossilUsageError } from "./fossil-cli-types/fossil-usage-error.js";
import { createFossilProgram } from "./fossil-cli-program.js";
async function reportUsageError(error, program, stderr) {
    if (!(error instanceof FossilUsageError))
        throw error;
    const analyzeCommand = program.commands.find((command) => command.name() === "analyze");
    if (!error.reported)
        stderr(`error: ${error.message}\n` +
            `${analyzeCommand?.helpInformation() ?? program.helpInformation()}`);
    throw error;
}
/** Parses CLI arguments through the injected analysis boundary. */
export async function runFossilCli(argv, dependencies) {
    const stderr = dependencies.stderr ?? process.stderr.write.bind(process.stderr);
    const program = createFossilProgram({ ...dependencies, stderr });
    try {
        await program.parseAsync([...argv], { from: "node" });
    }
    catch (error) {
        await reportUsageError(error, program, stderr);
    }
}
//# sourceMappingURL=fossil-cli-run.js.map