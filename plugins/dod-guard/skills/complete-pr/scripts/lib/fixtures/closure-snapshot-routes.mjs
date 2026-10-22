// The healthy route table for the closure snapshot tests, and the
// one-departure variants of it. The pages those routes serve are in
// closure-snapshot-pages.mjs.
import { buildClosureSnapshot } from "../closure-snapshot.mjs";
import {
  ENDPOINT,
  fakeRest,
  linkedProjectNode,
  linkedProjectsReply,
  NOT_FOUND,
  SERVER_ERROR,
} from "../closure-snapshot.test-support.mjs";
import {
  checkRunsReply,
  commitStatusReply,
  fieldPages,
  ok,
  REPO,
  REPO_URL,
} from "./rest-shapes.mjs";
import {
  COMMENT_BODY,
  HEAD,
  LINKED,
  PAGE_VARIANTS,
  valuePages,
} from "./closure-snapshot-pages.mjs";

function healthyRoutes(pages) {
  return {
    [ENDPOINT.repository]: ok({ full_name: REPO, default_branch: "master" }),
    [ENDPOINT.linkedProjects]: linkedProjectsReply(LINKED),
    [ENDPOINT.fields(2)]: ok(fieldPages()),
    [ENDPOINT.values(2)]: ok(pages),
    [ENDPOINT.subIssues(10)]: ok([
      [
        { number: 11, repository_url: REPO_URL },
        { number: 12, repository_url: REPO_URL },
      ],
    ]),
    [ENDPOINT.comments(10)]: ok([[{ id: 9001, body: COMMENT_BODY }]]),
    [ENDPOINT.protection]: ok({ contexts: ["build-test", "lint"] }),
    [ENDPOINT.checkRuns(HEAD[21])]: checkRunsReply(HEAD[21]),
    [ENDPOINT.statuses(HEAD[21])]: commitStatusReply(HEAD[21]),
    [ENDPOINT.checkRuns(HEAD[23])]: checkRunsReply(HEAD[23]),
    [ENDPOINT.statuses(HEAD[23])]: commitStatusReply(HEAD[23]),
  };
}

// Variants that change a route after the healthy table is built.
const ROUTE_VARIANTS = {
  repository: (routes) => {
    routes[ENDPOINT.repository] = SERVER_ERROR;
  },
  items: (routes) => {
    routes[ENDPOINT.values(2)] = SERVER_ERROR;
  },
  "non-object-item": (routes, pages) => {
    routes[ENDPOINT.values(2)] = ok([[...pages[0], "not an item"], pages[1]]);
  },
  "missing-page": (routes, pages) => {
    routes[ENDPOINT.values(2)] = ok([pages[0], { message: "Not Found" }]);
  },
  "no-parent-field": (routes) => {
    routes[ENDPOINT.fields(2)] = ok(fieldPages({ withParent: false }));
  },
  // The repository's items may sit in a Project, but without an open explicit
  // link it has none.
  "no-linked-project": (routes) => {
    routes[ENDPOINT.linkedProjects] = linkedProjectsReply([
      linkedProjectNode(3, { closed: true }),
    ]);
  },
  "two-linked-projects": (routes) => {
    routes[ENDPOINT.linkedProjects] = linkedProjectsReply([
      ...LINKED,
      linkedProjectNode(4),
    ]);
  },
  "protection-failure": (routes) => {
    routes[ENDPOINT.protection] = SERVER_ERROR;
  },
  "check-runs-failure": (routes) => {
    routes[ENDPOINT.checkRuns(HEAD[21])] = SERVER_ERROR;
  },
  "status-failure": (routes) => {
    routes[ENDPOINT.statuses(HEAD[21])] = SERVER_ERROR;
  },
  "no-protection": (routes) => {
    routes[ENDPOINT.protection] = NOT_FOUND;
  },
  blocked: (routes) => {
    routes[ENDPOINT.blockedBy(12)] = ok([[{ number: 250, state: "open", repository_url: REPO_URL }]]);
  },
  "blocked-failure": (routes) => {
    routes[ENDPOINT.blockedBy(12)] = SERVER_ERROR;
  },
};

// The healthy fixture, or one deliberate departure named by variant.
function fixtureRoutes(variant = "healthy") {
  const pages = valuePages();
  // Mutations must run before the routes below call ok(), which serializes its
  // value at that moment.
  PAGE_VARIANTS[variant]?.(pages);
  const routes = healthyRoutes(pages);
  ROUTE_VARIANTS[variant]?.(routes, pages);
  return routes;
}

function build(routes) {
  return buildClosureSnapshot({
    repository: REPO,
    runner: fakeRest(routes).runner,
  });
}

// Returns the error a build throws, or null when the build succeeds.
function buildFailure(routes) {
  try {
    build(routes);
  } catch (error) {
    return error;
  }
  return null;
}

export { build, buildFailure, fixtureRoutes };
