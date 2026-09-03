// A packaged-launch-shaped explorer fixture for dashboard integration experiments.
import { createServer } from "node:http";

const root = process.argv[process.argv.indexOf("--project-root") + 1];
if (!root || process.argv.at(-1) !== "--no-open") process.exit(2);
const server = createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("fake code explorer");
});
server.listen(4410, "127.0.0.1", () => process.stdout.write("Code Explorer: http://127.0.0.1:4410/\n"));
const stop = () => server.close(() => process.exit(0));
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
