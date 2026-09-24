import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createKnowledgeBaseServer } from "../src/index.js";

export async function connectKnowledgeBase(root: string | undefined, name = "knowledge-base-test") {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createKnowledgeBaseServer(root);
  await server.connect(serverTransport);
  const client = new Client({ name, version: "1.0.0" });
  await client.connect(clientTransport);
  return { client, server };
}

export async function withKnowledgeBaseClient(
  root: string | undefined,
  name: string,
  action: (client: Client) => Promise<void>,
): Promise<void> {
  const { client, server } = await connectKnowledgeBase(root, name);
  try {
    await action(client);
  } finally {
    await client.close();
    await server.close();
  }
}
