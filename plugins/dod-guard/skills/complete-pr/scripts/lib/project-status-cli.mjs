// biome-ignore lint/correctness/noNodejsModules: This shipped command exposes a direct CLI.
import process from "node:process";

function usage() {
  return [
    "Usage: node project-status.mjs <owner> <project-number> <status-field-node-id> <status-option-id> " +
      "<expected-status> <item-id>...",
    "  <item-id> is a Project item's numeric REST id or its PVTI_ global node id.",
    '  <expected-status> is the Status name to SET and the value every readback must show, for example "In Progress" or "Done"; it is not a precondition on the current Status.',
    "  An item already at <expected-status> gets no write and prints changed: false; a written item prints changed: true.",
    "       node project-status.mjs --list-options <owner> <project-number> <status-field-id>",
    "  --list-options prints each Status option as JSON {id, name} and writes nothing.",
    "       node project-status.mjs --help",
  ].join("\n");
}

function printUsageFailure() {
  process.stderr.write(`${usage()}\n`);
  process.exitCode = 2;
}

function printResult(produce) {
  try {
    process.stdout.write(`${JSON.stringify(produce(), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`project-status failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

function runCli(args, actions) {
  if (args[0] === "--help") {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (args[0] === "--list-options") {
    const [owner, projectNumber, statusFieldId] = args.slice(1);
    if ([owner, projectNumber, statusFieldId].some((argument) => !argument)) {
      printUsageFailure();
      return;
    }
    printResult(() => actions.listStatusOptions({ owner, projectNumber, statusFieldId }));
    return;
  }
  const [owner, projectNumber, statusFieldId, statusOptionId, expectedStatus, ...itemIds] = args;
  const requiredArguments = [owner, projectNumber, statusFieldId, statusOptionId, expectedStatus];
  if (requiredArguments.some((argument) => !argument) || itemIds.length === 0) {
    printUsageFailure();
    return;
  }
  printResult(() =>
    actions.writeProjectStatuses({ owner, projectNumber, statusFieldId, statusOptionId, expectedStatus, itemIds }),
  );
}

export { runCli };
