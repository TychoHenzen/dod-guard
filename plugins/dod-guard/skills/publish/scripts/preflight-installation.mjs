import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { failure } from "./preflight/failure.mjs";
import { preflight } from "./preflight/resolve.mjs";
import { parseArguments } from "./preflight-arguments.mjs";

// The plugin root is derived from where this entry file sits, so modules under preflight/
// must receive it and never derive it themselves.
const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function writeResult(result) {
  const text = `${JSON.stringify(result, null, 2)}\n`;
  if (result.ok) {
    process.stdout.write(text);
    return;
  }
  process.stderr.write(text);
  process.exitCode = 1;
}

const args = parseArguments(process.argv.slice(2));
preflight(args, scriptRoot)
  .then(writeResult)
  .catch((error) => {
    writeResult(
      failure({ client: args.client, requested: args.requested }, `Unexpected preflight failure: ${error.message}`),
    );
  });
