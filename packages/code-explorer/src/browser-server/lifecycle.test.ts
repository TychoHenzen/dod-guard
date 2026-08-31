import assert from "node:assert/strict";
import { request } from "node:http";
import { describe, it } from "node:test";
import {
  type ExplorerCoreFactory,
  type HttpListener,
  nativePortBinder,
  parseServeArguments,
  startBrowserServer,
} from "./lifecycle.js";

function fakeListener(port: number, stopped: number[]): HttpListener {
  return {
    address: new URL(`http://127.0.0.1:${port}/`),
    stopAdmission: () => stopped.push(port),
    close: async () => undefined,
  };
}

function factory(starts: string[]): ExplorerCoreFactory {
  return {
    start: async ({ projectRoot }) => {
      starts.push(projectRoot.canonicalPath);
      return { close: async () => undefined };
    },
  };
}

async function post(url: URL, body: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const request_ = request(url, { method: "POST", headers: { "content-type": "application/json" } }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () =>
        resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }),
      );
    });
    request_.once("error", reject);
    request_.end(body);
  });
}

describe("browser server lifecycle", () => {
  // covers: code-explorer/browser-server :: The package starts a project-scoped browser server :: Server starts from the working directory
  it("uses the working directory project vector when serve has no project argument", () => {
    assert.deepEqual(parseServeArguments(["serve"]), { project_root: ".", no_open: false });
  });

  // covers: code-explorer/browser-server :: The package starts a project-scoped browser server :: Startup argument selects the project
  it("preserves an explicit project argument instead of substituting the working directory", () => {
    assert.deepEqual(parseServeArguments(["serve", "--project-root", "..", "--no-open"]), {
      project_root: "..",
      no_open: true,
    });
  });

  // covers: code-explorer/browser-server :: The package starts a project-scoped browser server :: Browser request contains a project path
  it("rejects a browser request that attempts to replace the frozen project root", async () => {
    const listener = await nativePortBinder.listen("127.0.0.1", 4429, new AbortController().signal);
    try {
      const response = await post(listener.address, JSON.stringify({ project_root: "another-project" }));
      assert.equal(response.status, 400);
      assert.deepEqual(JSON.parse(response.body), {
        schema_version: 1,
        code: "invalid_request",
        message: "invalid_request",
        retryable: false,
      });
    } finally {
      await listener.close(AbortSignal.timeout(1_000));
    }
  });

  // covers: code-explorer/browser-server :: The package starts a project-scoped browser server :: Startup project is invalid
  it("fails before binding when the selected project root is invalid", async () => {
    let bound = false;
    await assert.rejects(
      startBrowserServer({
        project_root: "missing-project-root",
        no_open: true,
        coreFactory: factory([]),
        binder: {
          listen: async () => {
            bound = true;
            throw new Error("unexpected");
          },
        },
        opener: { open: async () => undefined },
      }),
      (error: unknown) => (error as { code?: string }).code === "invalid_project_root",
    );
    assert.equal(bound, false);
  });

  it("stops admission and aborts the shared core during shutdown", async () => {
    const stopped: number[] = [];
    let coreAborted = false;
    const service = await startBrowserServer({
      project_root: ".",
      no_open: true,
      coreFactory: {
        start: async ({ signal }) => ({
          close: async () => {
            coreAborted = signal.aborted;
          },
        }),
      },
      binder: { listen: async (_host, port) => fakeListener(port, stopped) },
      opener: { open: async () => undefined },
    });
    await service.close();
    assert.equal(coreAborted, true);
    assert.deepEqual(stopped, [4410]);
  });

  // covers: code-explorer/browser-server :: The server is reachable only through loopback :: Preferred port is available
  it("binds the preferred loopback port and reports its exact URL", async () => {
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
  });

  // covers: code-explorer/browser-server :: The server is reachable only through loopback :: Preferred port is occupied
  it("tries ascending loopback ports and reports the first available port", async () => {
    const attempts: number[] = [];
    const output: string[] = [];
    const service = await startBrowserServer({
      project_root: ".",
      no_open: true,
      coreFactory: factory([]),
      binder: {
        listen: async (_host, port) => {
          attempts.push(port);
          if (port < 4412) throw Object.assign(new Error("busy"), { code: "EADDRINUSE" });
          return fakeListener(port, []);
        },
      },
      opener: { open: async () => undefined },
      write: (line) => output.push(line),
    });
    assert.deepEqual(attempts, [4410, 4411, 4412]);
    assert.deepEqual(output, ["Code Explorer: http://127.0.0.1:4412/"]);
    await service.close();
  });

  // covers: code-explorer/browser-server :: The server is reachable only through loopback :: Every configured port is occupied
  it("returns browser_port_unavailable without opening a browser when all ports are occupied", async () => {
    let opens = 0;
    await assert.rejects(
      startBrowserServer({
        project_root: ".",
        no_open: false,
        coreFactory: factory([]),
        binder: {
          listen: async () => {
            throw Object.assign(new Error("busy"), { code: "EADDRINUSE" });
          },
        },
        opener: {
          open: async () => {
            opens += 1;
          },
        },
      }),
      (error: unknown) => (error as { code?: string }).code === "browser_port_unavailable",
    );
    assert.equal(opens, 0);
  });

  // covers: code-explorer/browser-server :: Startup opens the local browser unless disabled :: Default launch succeeds
  it("prints once then opens the exact listening URL", async () => {
    const opened: string[] = [];
    const lines: string[] = [];
    const service = await startBrowserServer({
      project_root: ".",
      no_open: false,
      coreFactory: factory([]),
      binder: { listen: async (_host, port) => fakeListener(port, []) },
      opener: {
        open: async (url) => {
          opened.push(url.href);
        },
      },
      write: (line) => lines.push(line),
    });
    assert.deepEqual(lines, ["Code Explorer: http://127.0.0.1:4410/"]);
    assert.deepEqual(opened, ["http://127.0.0.1:4410/"]);
    await service.close();
  });

  // covers: code-explorer/browser-server :: Startup opens the local browser unless disabled :: Automatic opening is disabled
  it("does not request a browser launch for no-open", async () => {
    let opened = false;
    const service = await startBrowserServer({
      project_root: ".",
      no_open: true,
      coreFactory: factory([]),
      binder: { listen: async (_host, port) => fakeListener(port, []) },
      opener: {
        open: async () => {
          opened = true;
        },
      },
    });
    assert.equal(opened, false);
    await service.close();
  });

  // covers: code-explorer/browser-server :: Startup opens the local browser unless disabled :: Operating system cannot open the browser
  it("keeps serving when browser opening fails", async () => {
    const errors: string[] = [];
    const service = await startBrowserServer({
      project_root: ".",
      no_open: false,
      coreFactory: factory([]),
      binder: { listen: async (_host, port) => fakeListener(port, []) },
      opener: {
        open: async () => {
          throw new Error("spawn failed");
        },
      },
      writeError: (line) => errors.push(line),
    });
    assert.deepEqual(errors, ["browser_open_failed"]);
    await service.close();
  });
});
