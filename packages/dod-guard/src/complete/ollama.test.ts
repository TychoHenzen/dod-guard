import assert from "node:assert/strict";
import { beforeEach, describe, it, mock } from "node:test";

// Mock http before importing the module under test
mock.module("node:http", {
  namedExports: {
    request: mock.fn(),
  },
});

const { checkClaimAlignment } = await import("./ollama.js");
const { request: mockRequest } = await import("node:http");

function fakeResponse(body: string) {
  const req = {
    on: mock.fn((_event: string, _handler: (err: Error) => void) => req),
    write: mock.fn(),
    end: mock.fn(),
    destroy: mock.fn(),
  };

  (mockRequest as any).mock.mockImplementation((_opts: any, callback: any) => {
    const res = {
      on: mock.fn((event: string, handler: any) => {
        if (event === "data") handler(Buffer.from(JSON.stringify({ response: body })));
        if (event === "end") handler();
        return res;
      }),
    };
    callback(res);
    return req;
  });

  return req;
}

function fakeError(message: string) {
  const req = {
    on: mock.fn((event: string, handler: any) => {
      if (event === "error") setTimeout(() => handler(new Error(message)), 0);
      return req;
    }),
    write: mock.fn(),
    end: mock.fn(),
    destroy: mock.fn(),
  };

  (mockRequest as any).mock.mockImplementation(() => req);

  return req;
}

const config = { model: "test-model", host: "127.0.0.1", port: 11434, timeoutMs: 5000 };

describe("checkClaimAlignment", () => {
  beforeEach(() => {
    (mockRequest as any).mock.resetCalls();
  });

  it("returns aligned: true when ollama says YES", async () => {
    fakeResponse("YES");
    const r = await checkClaimAlignment("assert.ok(true);", "#### Scenario: test\n- **THEN** it works", config);
    assert.equal(r.available, true);
    if (r.available) assert.equal(r.aligned, true);
  });

  it("returns aligned: false when ollama says NO", async () => {
    fakeResponse("NO");
    const r = await checkClaimAlignment("pass", "#### Scenario: test\n- **THEN** it works", config);
    assert.equal(r.available, true);
    if (r.available) assert.equal(r.aligned, false);
  });

  it("strips <think> tags before parsing", async () => {
    fakeResponse("<think>Let me analyze this...</think>\nYES");
    const r = await checkClaimAlignment("assert.ok(true);", "#### Scenario: test", config);
    assert.equal(r.available, true);
    if (r.available) assert.equal(r.aligned, true);
  });

  it("returns available: false on connection refused", async () => {
    fakeError("connect ECONNREFUSED 127.0.0.1:11434");
    const r = await checkClaimAlignment("code", "scenario", config);
    assert.equal(r.available, false);
    if (!r.available) assert.ok(r.reason.includes("ECONNREFUSED"));
  });
});
