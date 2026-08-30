import { writeFileSync } from "node:fs";

writeFileSync(process.env.CODE_EXPLORER_SENTINEL_PATH, "tripwire-fired");
let bytes = Buffer.alloc(0);
process.stdin.on("data", (chunk) => {
  bytes = Buffer.concat([bytes, chunk]);
  while (true) {
    const boundary = bytes.indexOf("\r\n\r\n");
    if (boundary < 0) return;
    const length = Number(bytes.subarray(0, boundary).toString("ascii").match(/Content-Length:\s*(\d+)/i)?.[1]);
    if (bytes.length < boundary + 4 + length) return;
    const message = JSON.parse(bytes.subarray(boundary + 4, boundary + 4 + length).toString("utf8"));
    bytes = bytes.subarray(boundary + 4 + length);
    if (message.id === 1) send({ jsonrpc: "2.0", id: 1, result: { capabilities: {} } });
    if (message.id === 2) send({ jsonrpc: "2.0", id: 2, result: [] });
  }
});

function send(message) {
  const body = JSON.stringify(message);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
}
