import { isLinkedProjectRead, LINKED_PROJECT_READ } from "../../../../lib/linked-project-read.mjs";
import { isHttpNotFoundText } from "./gh-runner.mjs";
import { messageOf, readFailure } from "./snapshot-failure.mjs";

const ENDPOINT = /^(?:repos|users|orgs)\//u;

// The GraphQL read carries its whole query as an argument, so it is named by
// its read instead.
function endpointOf(args) {
  if (isLinkedProjectRead(args)) {
    return LINKED_PROJECT_READ;
  }
  const endpoint = args.find((arg) => ENDPOINT.test(arg));
  if (endpoint === undefined) {
    return args.join(" ");
  }
  return endpoint;
}

function text(value) {
  return String(value ?? "").trim();
}

function failureDetail(result) {
  return text(result?.stderr) || text(result?.stdout) || `gh exited with ${result?.status}`;
}

function runCall(runner, call) {
  try {
    return runner(call.args, call.acceptedExitCodes);
  } catch (error) {
    throw readFailure(call.endpoint, messageOf(error), error);
  }
}

function isAcceptedResult(result, acceptedExitCodes) {
  const accepted = acceptedExitCodes.includes(result?.status);
  const notFound = isHttpNotFoundText(result?.stderr);
  return accepted && (result.status === 0 || notFound);
}

export function readJson(read, endpoint, args) {
  const { stdout } = read(args);
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw readFailure(endpoint, "did not return JSON", error);
  }
}

// Memoizes each read by its arguments and accepted exit codes, and never memoizes a failure, so a later
// read asks GitHub again. A non-zero exit counts only when the caller accepts it and it is HTTP 404, because
// every caller here that accepts one reads a 404 as absence; any other failure is a read failure naming its endpoint.
export function guardedRunner(runner) {
  const memo = new Map();
  return (args, acceptedExitCodes = [0]) => {
    const key = JSON.stringify([args, acceptedExitCodes]);
    if (memo.has(key)) {
      return memo.get(key);
    }
    const endpoint = endpointOf(args);
    const result = runCall(runner, { args, acceptedExitCodes, endpoint });
    if (!isAcceptedResult(result, acceptedExitCodes)) {
      throw readFailure(endpoint, failureDetail(result));
    }
    memo.set(key, result);
    return result;
  };
}
