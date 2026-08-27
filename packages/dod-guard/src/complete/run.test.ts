import assert from "node:assert/strict";
import { beforeEach, describe, it, mock } from "node:test";

let written: string[] = [];
let errors: string[] = [];
const io = {
  write: (s: string) => written.push(s),
  writeErr: (s: string) => errors.push(s),
};

const TASKS_MD = `## 1. Setup

- [ ] 1.1 Add the parser
<!-- covers: dod-guard/coverage :: cover reports :: bound test found -->
<!-- status: pending -->
<!-- verify_cmd: node --test dist/test.js -->

- [ ] 1.2 Manual step
<!-- status: pending -->
<!-- manual_required: true -->

- [x] 1.3 Already done
<!-- status: completed -->

- [ ] 1.4 No covers annotation
<!-- status: pending -->
<!-- verify_cmd: echo ok -->
`;

let lastWrittenContent: string | undefined;

const mockReadFile = mock.fn(async () => TASKS_MD);
const mockWriteFile = mock.fn(async (_p: string, content: string) => {
  lastWrittenContent = content;
});
const mockRunShellCommand = mock.fn(async () => ({ stdout: "", stderr: "", code: 0 }));
const mockScanMarkers = mock.fn(async () => new Map());

mock.module("node:fs", {
  namedExports: {
    promises: {
      readFile: mockReadFile,
      writeFile: mockWriteFile,
    },
  },
});

mock.module("../shell.js", {
  namedExports: {
    runShellCommand: mockRunShellCommand,
    buildShellInvocation: mock.fn(() => ({ shell: "sh", args: ["-c", "echo"], verbatim: false })),
  },
});

mock.module("../cover/markers.js", {
  namedExports: {
    scanMarkers: mockScanMarkers,
  },
});

mock.module("../cover/enumerate.js", {
  namedExports: {
    enumerateChangeScenarios: mock.fn(async () => []),
    enumerateAllScenarios: mock.fn(async () => []),
  },
});

mock.module("./ollama.js", {
  namedExports: {
    getOllamaConfig: mock.fn(() => undefined),
    checkClaimAlignment: mock.fn(async () => ({ available: false, reason: "not configured" })),
  },
});

const mockDetectTampering = mock.fn(async () => ({
  tampered: [] as Array<{
    taskId: string;
    field: string;
    shadowValue: boolean | string | undefined;
    diskValue: boolean | string | undefined;
  }>,
  shadowMissing: true,
  shadowCorrupted: false,
}));
const mockRevertTampering = mock.fn((content: string) => content);
const mockSnapshotTasks = mock.fn(async () => {});

mock.module("./task-guard.js", {
  namedExports: {
    detectTampering: mockDetectTampering,
    revertTampering: mockRevertTampering,
    snapshotTasks: mockSnapshotTasks,
    guardExists: mock.fn(async () => false),
  },
});

const { runComplete, EXIT_OK, EXIT_REJECTED, EXIT_USAGE } = await import("./run.js");

describe("runComplete", () => {
  beforeEach(() => {
    written = [];
    errors = [];
    lastWrittenContent = undefined;
    mockReadFile.mock.mockImplementation(async () => TASKS_MD);
    mockWriteFile.mock.mockImplementation(async (_p: string, content: string) => {
      lastWrittenContent = content;
    });
    mockRunShellCommand.mock.mockImplementation(async () => ({ stdout: "", stderr: "", code: 0 }));
    mockScanMarkers.mock.mockImplementation(async () => new Map());
    mockDetectTampering.mock.mockImplementation(async () => ({
      tampered: [],
      shadowMissing: true,
      shadowCorrupted: false,
    }));
    mockRevertTampering.mock.mockImplementation((content: string) => content);
    mockSnapshotTasks.mock.resetCalls();
  });

  it("returns EXIT_USAGE when tasks.md does not exist", async () => {
    mockReadFile.mock.mockImplementation(async () => {
      throw new Error("ENOENT");
    });
    const code = await runComplete({ cwd: ".", changeId: "no-such-change", taskId: "1.1" }, io);
    assert.equal(code, EXIT_USAGE);
  });

  it("returns EXIT_USAGE when task id is not found", async () => {
    const code = await runComplete({ cwd: ".", changeId: "test-change", taskId: "99.9" }, io);
    assert.equal(code, EXIT_USAGE);
  });

  it("returns EXIT_OK for an already-completed task", async () => {
    const code = await runComplete({ cwd: ".", changeId: "test-change", taskId: "1.3" }, io);
    assert.equal(code, EXIT_OK);
    assert.ok(written.some((s) => s.includes("already completed")));
  });

  it("marks a manual task complete without running checks", async () => {
    const code = await runComplete({ cwd: ".", changeId: "test-change", taskId: "1.2" }, io);
    assert.equal(code, EXIT_OK);
    assert.ok(written.some((s) => s.includes("marked complete")));
    assert.ok(lastWrittenContent?.includes("[x] 1.2"));
  });

  it("rejects when verify_cmd fails", async () => {
    mockRunShellCommand.mock.mockImplementation(async () => ({
      stdout: "",
      stderr: "test failed",
      code: 1,
    }));
    const code = await runComplete({ cwd: ".", changeId: "test-change", taskId: "1.1" }, io);
    assert.equal(code, EXIT_REJECTED);
    assert.ok(errors.some((s) => s.includes("verify_cmd failed")));
  });

  it("marks a task with passing verify_cmd and no marker binding as complete", async () => {
    const code = await runComplete({ cwd: ".", changeId: "test-change", taskId: "1.1" }, io);
    assert.equal(code, EXIT_OK);
    assert.ok(lastWrittenContent?.includes("[x] 1.1"));
  });

  it("marks a task with no covers annotation complete after verify_cmd passes", async () => {
    const code = await runComplete({ cwd: ".", changeId: "test-change", taskId: "1.4" }, io);
    assert.equal(code, EXIT_OK);
    assert.ok(lastWrittenContent?.includes("[x] 1.4"));
  });

  it("rejects when the shadow guard is corrupted", async () => {
    mockDetectTampering.mock.mockImplementation(async () => ({
      tampered: [],
      shadowMissing: false,
      shadowCorrupted: true,
    }));
    const code = await runComplete({ cwd: ".", changeId: "test-change", taskId: "1.1" }, io);
    assert.equal(code, EXIT_REJECTED);
    assert.ok(errors.some((s) => s.includes("corrupted")));
  });

  it("reverts tampered tasks and re-snapshots", async () => {
    mockDetectTampering.mock.mockImplementation(async () => ({
      tampered: [{ taskId: "1.1", field: "checked", shadowValue: false, diskValue: true }],
      shadowMissing: false,
      shadowCorrupted: false,
    }));
    mockRevertTampering.mock.mockImplementation((content: string) =>
      content.replace("[x] 1.1", "[ ] 1.1").replace("status: completed", "status: reverted"),
    );
    const code = await runComplete({ cwd: ".", changeId: "test-change", taskId: "1.2" }, io);
    assert.equal(code, EXIT_OK);
    assert.ok(errors.some((s) => s.includes("REVERTED")));
  });
});
