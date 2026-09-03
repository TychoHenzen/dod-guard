import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const child = spawn(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), "process-tree-child.mjs")], {
  stdio: "ignore",
  windowsHide: true,
});
process.stdout.write(`${child.pid}\n`);
const stop = () => {
  child.kill();
  child.once("exit", () => process.exit(0));
};
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
setInterval(() => {}, 1_000);
