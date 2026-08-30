import { existsSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const fixture = resolve(scriptDirectory, "../fixtures/safe-mode-sentinels/csharp");
const tripwire = resolve(fixture, "SENTINEL_SIDE_EFFECT");
const analyzerTripwire = `${tripwire}.analyzer-initialize`;
const generatorTripwire = `${tripwire}.generator-initialize`;
const project = resolve(fixture, "hooks/SentinelHooks.csproj");

if (existsSync(tripwire)) rmSync(tripwire);
if (existsSync(analyzerTripwire)) rmSync(analyzerTripwire);
if (existsSync(generatorTripwire)) rmSync(generatorTripwire);
const result = spawnSync("dotnet", ["build", project, "--configuration", "Release", "--nologo"], {
  cwd: fixture,
  encoding: "utf8",
  shell: false,
});
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
if (result.status !== 0) process.exit(result.status ?? 1);

if (process.argv[2] !== "--positive-control") process.exit(0);

if (existsSync(tripwire)) rmSync(tripwire);
const positiveControl = spawnSync("dotnet", ["build", resolve(fixture, "Sentinel.csproj"), "--nologo", "-p:UseSharedCompilation=false"], {
  cwd: fixture,
  encoding: "utf8",
  env: { ...process.env, CODE_EXPLORER_SENTINEL_PATH: tripwire },
  shell: false,
});
process.stdout.write(positiveControl.stdout);
process.stderr.write(positiveControl.stderr);
if (positiveControl.status !== 0) process.exit(positiveControl.status ?? 1);
if (!(existsSync(analyzerTripwire) && existsSync(generatorTripwire))) {
  throw new Error("C# analyzer and generator did not independently create the test-owned tripwires");
}
process.stdout.write(
  `${JSON.stringify({
    positive_control_tripwires: {
      analyzer: readFileSync(analyzerTripwire, "utf8"),
      generator: readFileSync(generatorTripwire, "utf8"),
    },
  })}\n`,
);
