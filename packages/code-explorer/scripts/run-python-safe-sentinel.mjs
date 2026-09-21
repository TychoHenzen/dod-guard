import { existsSync, rmSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createLspFrameStream } from "./lsp-frame-stream.mjs";
import {
  isConfigurationRequest,
  isInitializeResponse,
  sendConfiguration,
  sendInitialization,
  sendMessage,
} from "./run-python-safe-sentinel-protocol.mjs";
import { createSentinelSession } from "./run-python-safe-sentinel-process.mjs";

const [serverEntrypoint, fixture] = process.argv.slice(2);
if (!(serverEntrypoint && fixture))
  throw new Error(
    "usage: run-python-safe-sentinel <pyright-server.js> <fixture>",
  );

const { child, mirror, root, sentinel } = await createSentinelSession(
  serverEntrypoint,
  fixture,
);
rmSync(sentinel, { force: true });

let stderr = "";
let initialized = false;
let finished = false;
let configurationReplies = 0;
let timeout;
const send = (message) => sendMessage(child, message);
const finish = (result) => {
  if (finished) return;
  finished = true;
  clearTimeout(timeout);
  const disposeAndReport = () => {
    mirror.dispose();
    process.stdout.write(
      `${JSON.stringify({
        ...result,
        side_effect_absent: !existsSync(sentinel),
        configuration_replies: configurationReplies,
        stderr,
      })}\n`,
    );
  };
  if (child.exitCode !== null) {
    disposeAndReport();
    return;
  }
  child.once("exit", disposeAndReport);
  child.kill();
};
timeout = setTimeout(
  () => finish({ initialized, definition_responded: false, timeout: true }),
  30_000,
);
child.stderr.on("data", (chunk) => (stderr += chunk));
child.on("error", (error) =>
  finish({ initialized, definition_responded: false, error: String(error) }),
);
const handleFrame = (message) => {
  if (isInitializeResponse(message, initialized)) {
    initialized = true;
    sendInitialization(child, mirror, root);
    return;
  }
  if (isConfigurationRequest(message)) {
    configurationReplies += 1;
    sendConfiguration(child, message);
    return;
  }
  if (message.id === 2)
    finish({
      initialized,
      definition_responded: true,
      definition: message.result,
    });
};
child.stdout.on("data", createLspFrameStream(handleFrame));
send({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    processId: null,
    rootUri: pathToFileURL(mirror.root).href,
    capabilities: { workspace: { configuration: true } },
    initializationOptions: {
      use_project_environment: false,
      mirror_only: true,
    },
  },
});
