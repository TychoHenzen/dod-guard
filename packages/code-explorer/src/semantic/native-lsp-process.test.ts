import assert from "node:assert/strict";
import { it } from "node:test";
import { spawnNativeLspProcess } from "./native-lsp-process.js";

it("uses a shell-free child process with caller-owned environment", async () => {
  const lspProcess = spawnNativeLspProcess(
    process.execPath,
    ["-e", "process.stdout.write(process.env.VISIBLE ?? 'missing')"],
    {
      VISIBLE: "bounded",
    },
  );
  const chunks: string[] = [];
  const exited = new Promise<void>((resolve) => lspProcess.onExit(() => resolve()));
  lspProcess.onStdout((chunk) => chunks.push(new TextDecoder().decode(chunk)));
  await exited;
  assert.equal(chunks.join(""), "bounded");
});
