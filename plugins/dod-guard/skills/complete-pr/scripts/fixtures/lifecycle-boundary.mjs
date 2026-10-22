import { isLinkedProjectRead } from "../../../../lib/linked-project-read.mjs";
import { runTransport } from "../../../../lib/transport-policy.mjs";
import {
  issueMarker,
  OWNER,
  PROJECT_NUMBER,
  REPOSITORY,
} from "./lifecycle-constants.mjs";

const GRAPHQL = /graphql/i;

// Any GraphQL except the documented linked-Project read, which is the one
// exception the standard allows.
export function isRoutineGraphql(args) {
  const graphql = args.some((value) => GRAPHQL.test(String(value)));
  return graphql && !isLinkedProjectRead(args);
}

export function runRest(transport, args) {
  const result = transport.commandRunner(args);
  return result.stdout.trim() ? JSON.parse(result.stdout) : null;
}

export function readProjectMembership(transport) {
  const path = `users/${OWNER}/projectsV2/${PROJECT_NUMBER}/items`;
  const endpoint = `${path}?per_page=100`;
  const result = transport.commandRunner([
    "api",
    "--paginate",
    "--jq",
    ".[]",
    endpoint,
  ]);
  return result.stdout.trim() === ""
    ? []
    : result.stdout
        .trim()
        .split(/\r?\n/)
        .map((line) => JSON.parse(line));
}

function mcpPrimary(context, operation, rest) {
  return async () => {
    context.mcpCalls.push(operation);
    if (context.mcpRateLimited) {
      throw Object.assign(new Error("API rate limit exceeded"), {
        status: 429,
        transport: "mcp",
      });
    }
    return rest();
  };
}

function restFallback(context, operation, rest) {
  return async () => {
    context.restCalls.push(operation);
    return rest();
  };
}

export async function runBoundary(
  context,
  { operation, request = {}, restEndpoint, rest },
) {
  const result = await runTransport({
    operation,
    request,
    restEndpoint,
    evidence: context.transportFailures,
    primary: mcpPrimary(context, operation, rest),
    rest: restFallback(context, operation, rest),
  });
  return result.value;
}

export function issuesWithMarker(transport, marker) {
  const endpoint = `repos/${REPOSITORY}/issues?state=all&per_page=100`;
  const issues = runRest(transport, ["api", endpoint]);
  return issues.filter(({ body }) => body.includes(marker));
}

function attemptIssueCreate(transport, number, marker) {
  try {
    runRest(transport, [
      "api",
      "--method",
      "POST",
      `repos/${REPOSITORY}/issues`,
      "-f",
      `title=Disposable fixture ${number}`,
      "-f",
      `body=Captured for REST lifecycle proof.\n\n${marker}`,
    ]);
    return undefined;
  } catch (error) {
    return error;
  }
}

function settleCreateReadback(readback, marker, createError) {
  if (readback.length === 1) return readback[0];
  if (readback.length > 1) {
    throw new Error(`Issue marker ${marker} is not unique.`, {
      cause: createError,
    });
  }
  throw new Error(
    `Issue create for ${marker} was unresolved after authoritative readback.`,
    { cause: createError },
  );
}

function createAndReadBack(context, number, marker) {
  const createError = attemptIssueCreate(context.transport, number, marker);
  const readback = issuesWithMarker(context.transport, marker);
  return settleCreateReadback(readback, marker, createError);
}

export async function createIssueWithGuard(context, number) {
  const marker = issueMarker(number);
  const probe = await runBoundary(context, {
    operation: `capture-probe-${number}`,
    request: { repository: REPOSITORY, marker },
    restEndpoint: `GET /repos/${REPOSITORY}/issues?state=all&per_page=100`,
    rest: () => issuesWithMarker(context.transport, marker),
  });
  if (probe.length > 1) {
    throw new Error(`Issue marker ${marker} is not unique.`);
  }
  if (probe.length === 1) return probe[0];

  return runBoundary(context, {
    operation: `capture-create-${number}`,
    request: { repository: REPOSITORY, marker },
    restEndpoint: `POST /repos/${REPOSITORY}/issues`,
    rest: () => createAndReadBack(context, number, marker),
  });
}

function membershipOf(transport, issue) {
  return readProjectMembership(transport).filter(
    ({ content }) => content.number === issue.number,
  );
}

function addMembershipIfMissing(context, issue) {
  if (membershipOf(context.transport, issue).length === 0) {
    runRest(context.transport, [
      "api",
      "--method",
      "POST",
      `users/${OWNER}/projectsV2/${PROJECT_NUMBER}/items`,
      "-f",
      "type=Issue",
      "-F",
      `id=${issue.id}`,
    ]);
  }
  const readback = membershipOf(context.transport, issue);
  if (readback.length !== 1) {
    throw new Error(
      `Project membership for issue ${issue.number} was unresolved.`,
    );
  }
  return readback[0];
}

export async function ensureProjectMembership(context, issue) {
  await runBoundary(context, {
    operation: `membership-${issue.number}`,
    request: {
      owner: OWNER,
      projectNumber: PROJECT_NUMBER,
      issueNumber: issue.number,
      issueId: issue.id,
    },
    restEndpoint: `POST /users/${OWNER}/projectsV2/${PROJECT_NUMBER}/items`,
    rest: () => addMembershipIfMissing(context, issue),
  });
}
