import { it } from "node:test";
import * as support from "../testing/backend/\
backend-launch-policy-test-support.js";

it("snapshots server-owned launch data \
and freezes returned preparation", () => {
  const entry = support.policyAllowlist()[0];
  const launch = support.createBackendLaunchPolicy({
    project_root: "/project",
    allowlist: [entry],
    inspect: () => support.identity,
  });
  const preparation = launch.prepare("rust");
  if (preparation.status !== "ready")
    throw new Error("expected launch preparation");
  entry.arguments.push("--mutated");
  entry.environment.RUST_BACKTRACE = "1";
  (
    entry.safe_initialization_options.cargo as {
      buildScripts: { enable: boolean };
    }
  ).buildScripts.enable = true;
  support.assert.deepEqual(preparation.arguments, ["--stdio"]);
  support.assert.deepEqual(preparation.environment, {
    RUST_BACKTRACE: "0",
  });
  support.assert.equal(
    (
      preparation.safe_initialization_options.cargo as {
        buildScripts: { enable: boolean };
      }
    ).buildScripts.enable,
    false,
  );
  support.assert.throws(
    () => (preparation.arguments as string[]).push("--also-mutated"),
    TypeError,
  );
  support.assert.throws(
    () =>
      ((
        preparation.environment as {
          RUST_BACKTRACE: string;
        }
      ).RUST_BACKTRACE = "2"),
    TypeError,
  );
  support.assert.throws(
    () =>
      ((
        preparation.safe_initialization_options.cargo as {
          buildScripts: { enable: boolean };
        }
      ).buildScripts.enable = true),
    TypeError,
  );
});

it("uses Rust safe options without project executable hooks", () => {
  const launch = support.policy().prepare("rust");
  support.assert.equal(launch.status, "ready");
  support.assert.deepEqual(support.policy().safeOptions("rust"), {
    cargo: {
      buildScripts: { enable: false },
      procMacro: { enable: false },
      checkOnSave: { enable: false },
    },
    projectConfiguration: { enable: false },
  });
});
