import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { startBrowserServer } from "../../../browser-server/lifecycle.js";
import { ascendingPorts } from "./ascending-ports-fixture.js";
import { factory } from "./factory-fixture.js";
import { fakeListener } from "./fake-listener-fixture.js";

describe("browser server lifecycle", () => {
  it(
    "binds the preferred loopback port and " + "reports its exact URL",
    async () => {
      const attempts: Array<[string, number]> = [];
      const stopped: number[] = [];
      const urls: string[] = [];
      const service = await startBrowserServer({
        project_root: ".",
        no_open: true,
        coreFactory: factory([]),
        binder: {
          listen: async (host, port) => {
            attempts.push([host, port]);
            return fakeListener(port, stopped);
          },
        },
        opener: { open: async () => undefined },
        write: (line) => urls.push(line),
      });
      assert.deepEqual(attempts, [["127.0.0.1", 4410]]);
      assert.deepEqual(urls, ["Code Explorer: http://127.0.0.1:4410/"]);
      await service.close();
      assert.deepEqual(stopped, [4410]);
    },
  );
  it(
    "tries ascending loopback ports and reports the first " + "available port",
    async () => {
      const attempts: number[] = [];
      const output: string[] = [];
      const service = await startBrowserServer({
        project_root: ".",
        no_open: true,
        coreFactory: factory([]),
        binder: ascendingPorts(attempts),
        opener: { open: async () => undefined },
        write: (line) => output.push(line),
      });
      assert.deepEqual(attempts, [4410, 4411, 4412]);
      assert.deepEqual(output, ["Code Explorer: http://127.0.0.1:4412/"]);
      await service.close();
    },
  );
});
