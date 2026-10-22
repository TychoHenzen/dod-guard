// The required-checks test files share these runner and response builders.
function createRestChecksRunner({
  checkRunResponses,
  protection = { checks: [{ app_id: 15_368, context: "build-test" }] },
  statusResponse = { statuses: [] },
}) {
  const calls = [];
  const responses = [...checkRunResponses];
  const runner = (args) => {
    calls.push(args);
    const endpoint = args.find(
      (value) => typeof value === "string" && value.startsWith("repos/"),
    );
    if (endpoint?.includes("required_status_checks")) {
      return { stderr: "", status: 0, stdout: JSON.stringify(protection) };
    }
    if (endpoint?.includes("/check-runs?")) {
      return responses.shift();
    }
    if (endpoint?.includes("/status?")) {
      return {
        stderr: "",
        status: 0,
        stdout: JSON.stringify(statusResponse),
      };
    }
    throw new Error(`Unexpected command: ${args.join(" ")}`);
  };
  return { calls, runner };
}

function checkRunsResponse(runs) {
  return {
    stderr: "",
    status: 0,
    stdout: JSON.stringify({ check_runs: runs }),
  };
}

function exactHeadPullRequest() {
  return { baseBranch: "master", headSha: "head-1" };
}

export { checkRunsResponse, createRestChecksRunner, exactHeadPullRequest };
