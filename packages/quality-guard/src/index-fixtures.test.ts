import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createQualityGuardServer } from "./index.js";

function git(root: string, args: string[]): void {
  execFileSync("git", args, { cwd: root, stdio: "ignore" });
}

export function stagedFixture(): string {
  const root = mkdtempSync(path.join(tmpdir(), "quality-guard-mcp-"));
  git(root, ["init"]);
  git(root, ["config", "user.email", "test@example.invalid"]);
  git(root, ["config", "user.name", "Test"]);
  mkdirSync(path.join(root, ".github", "quality"), { recursive: true });
  writeFileSync(path.join(root, "source.ts"), "export class Existing {}\n");
  writeFileSync(
    path.join(root, ".github", "quality", "quality-baseline.json"),
    '{"version":2,"profile":"default","total":0,"counts":{},' +
      '"files":["source.ts"]}\n',
  );
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "base"]);
  writeFileSync(
    path.join(root, "source.ts"),
    "export class Existing { public added(): void {} }\n",
  );
  git(root, ["add", "source.ts"]);
  return root;
}

export async function connect(): Promise<{
  client: Client;
  close: () => Promise<void>;
}> {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const server = createQualityGuardServer();
  await server.connect(serverTransport);
  const client = new Client({ name: "quality-guard-test", version: "1.0.0" });
  await client.connect(clientTransport);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

export function resultText(result: unknown): string {
  const content = (result as { content?: unknown }).content as
    | Array<{ type: string; text?: string }>
    | undefined;
  return content?.[0]?.type === "text" ? (content[0].text ?? "") : "";
}

export function removeFixture(root: string): void {
  rmSync(root, { recursive: true, force: true });
}
