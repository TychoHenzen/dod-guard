import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const statePath = path.join(dir, "state.json");
const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
const [tool, ...args] = process.argv.slice(2);
const line = args.join(" ");
const save = () => fs.writeFileSync(statePath, JSON.stringify(state));
const ok = (text) => {
  fs.writeSync(1, text);
  process.exit(0);
};
const fail = (code, text) => {
  fs.writeSync(2, text + "\n");
  process.exit(code);
};
const head200 = "HTTP/2.0 200 OK\n\n";

fs.writeSync(2, "remote: Bypassed rule violations for refs/heads/master:\n");

if (tool === "git") {
  if (args[0] === "rev-parse" && args[1] === "--path-format=absolute") ok("C:/repo/.git\n");
  if (line === "rev-parse HEAD") ok(state.head + "\n");
  if (line === "rev-parse HEAD^") ok(state.savedSha + "\n");
  if (line === "status --porcelain --untracked-files=no") ok("");
  if (args[0] === "push") {
    if (process.env.DOD_GUARD_FAIL_GIT_PUSH === "1") fail(5, "error: failed to push some refs");
    state.remote = state.head;
    save();
    ok("");
  }
  if (line === "ls-remote origin refs/heads/master") ok(state.remote + "\trefs/heads/master\n");
  fail(9, "unexpected git: " + line);
}

if (tool === "gh") {
  const [api, methodFlag, method, endpoint, include] = args;
  if (api !== "api" || methodFlag !== "--method" || include !== "--include" || args.length !== 5) {
    fail(9, "unexpected gh: " + line);
  }
  if (method === "GET" && endpoint === state.protectionEndpoint) {
    ok(
      head200 +
        JSON.stringify({
          url: "https://api.github.com/" + endpoint,
          allow_force_pushes: { enabled: true },
          enforce_admins: { enabled: state.adminEnabled },
          required_status_checks: { strict: true, contexts: ["build-test"] },
        }) +
        "\n",
    );
  }
  if (method === "GET" && endpoint === state.adminEndpoint) {
    ok(head200 + JSON.stringify({ enabled: state.adminEnabled }) + "\n");
  }
  if (method === "DELETE" && endpoint === state.adminEndpoint) {
    state.adminEnabled = false;
    save();
    ok("HTTP/2.0 204 No Content\n\n");
  }
  if (method === "POST" && endpoint === state.adminEndpoint) {
    state.adminEnabled = true;
    save();
    ok(head200);
  }
  fail(9, "unexpected gh endpoint: " + line);
}

fail(9, "unknown tool: " + tool);
