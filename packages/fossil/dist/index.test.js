import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeRepository, FossilAnalysisError, FossilUsageError, NotRepositoryAnalysisError, runFossilCli, runFossilCliProcess, } from "./index.js";
const validDirectOptions = JSON.parse('{"days":90,"gapHours":48,"threshold":0.4,"format":"json","extensions":[],"untrackedAgeDays":90,"exclude":[],"verbose":false}');
const invalidDirectOptionShapes = [
    { days: 0 },
    { gapHours: 8_761 },
    { threshold: Number.NaN },
    { untrackedAgeDays: 3_651 },
    { format: "yaml" },
    { extensions: Array.from({ length: 65 }, () => "ts") },
    { extensions: [""] },
    { extensions: [42] },
    { extensions: "ts" },
    { exclude: [42] },
    { exclude: "generated/**" },
    { verbose: "true" },
];
function reportFor(options) {
    return {
        schemaVersion: 1,
        options,
        analysisTimestampMs: 0,
        gitVersion: "2.47.0",
        boundary: { repositoryRoot: "C:/repo", canonicalRepositoryRoot: "C:/repo", unobservedMechanisms: [] },
        limits: {
            maximumCommits: 0,
            maximumFileStatusRecords: 0,
            maximumInventoriedFiles: 0,
            maximumGitStdoutBytes: 0,
            maximumGitStderrBytes: 0,
            maximumReferenceFileBytes: 0,
            maximumReferenceTotalBytes: 0,
        },
        usage: {
            commitRecords: 0,
            fileStatusRecords: 0,
            inventoriedFiles: 0,
            gitStdoutBytes: 0,
            gitStderrBytes: 0,
            referenceBytes: 0,
            omittedReferencePaths: 0,
        },
        completeness: { historyComplete: true, referenceAnalysisComplete: true, workspaceDebrisComplete: true },
        statistics: {
            includedCommitCount: 0,
            logicalFileCount: 0,
            burstCount: 0,
            candidateFindingCount: 0,
            uniqueCandidatePathCount: 0,
            workspaceDebrisCount: 0,
        },
        warnings: [],
        bursts: [],
        workspaceDebris: [],
    };
}
test("passes normalized defaults and the current directory to analyze", async () => {
    const calls = [];
    let invocation = 0;
    const dependencies = {
        cwd: () => "C:/repositories/default",
        stdout: () => undefined,
        analyze: async (repositoryPath, options) => {
            calls.push({ repositoryPath, options: structuredClone(options) });
            if (invocation === 0) {
                options.extensions.push("mutated");
                options.exclude.push("mutated");
            }
            invocation += 1;
            return reportFor(options);
        },
    };
    await runFossilCli(["node", "fossil", "analyze"], dependencies);
    await runFossilCli(["node", "fossil", "analyze", "C:/repositories/explicit"], dependencies);
    assert.deepEqual(calls, [
        {
            repositoryPath: "C:/repositories/default",
            options: {
                days: 90,
                gapHours: 48,
                threshold: 0.4,
                format: "table",
                extensions: [],
                untrackedAgeDays: 90,
                exclude: [],
                verbose: false,
            },
        },
        {
            repositoryPath: "C:/repositories/explicit",
            options: {
                days: 90,
                gapHours: 48,
                threshold: 0.4,
                format: "table",
                extensions: [],
                untrackedAgeDays: 90,
                exclude: [],
                verbose: false,
            },
        },
    ]);
});
test("normalizes every explicit analyze option", async () => {
    const calls = [];
    await runFossilCli([
        "node",
        "fossil",
        "analyze",
        "C:/repositories/explicit path",
        "--days",
        "180",
        "--gap-hours",
        "72",
        "--threshold",
        "0.75",
        "--format",
        "json",
        "--extensions",
        " ts, .js , rs ",
        "--untracked-age",
        "120",
        "--exclude",
        " generated/**, .cache ",
        "--verbose",
    ], {
        analyze: async (repositoryPath, options) => {
            calls.push({ repositoryPath, options });
            return reportFor(options);
        },
        stdout: () => undefined,
    });
    assert.deepEqual(calls, [
        {
            repositoryPath: "C:/repositories/explicit path",
            options: {
                days: 180,
                gapHours: 72,
                threshold: 0.75,
                format: "json",
                extensions: ["ts", ".js", "rs"],
                untrackedAgeDays: 120,
                exclude: ["generated/**", ".cache"],
                verbose: true,
            },
        },
    ]);
});
test("rejects invalid argument forms with usage diagnostics before analysis", async () => {
    const invalidArguments = [
        ["--days", "0"],
        ["--untracked-age", "3651"],
        ["--gap-hours", "8761"],
        ["--threshold", "-0.1"],
        ["--threshold", "NaN"],
        ["--format", "yaml"],
        ["--extensions", Array.from({ length: 65 }, (_, index) => `extension-${index}`).join(",")],
        ["--unknown"],
        ["first", "second"],
    ];
    for (const argumentsForCase of invalidArguments) {
        const stderr = [];
        let analyzeCalls = 0;
        await assert.rejects(runFossilCli(["node", "fossil", "analyze", ...argumentsForCase], {
            analyze: async () => {
                analyzeCalls += 1;
                return reportFor({
                    days: 90,
                    gapHours: 48,
                    threshold: 0.4,
                    format: "table",
                    extensions: [],
                    untrackedAgeDays: 90,
                    exclude: [],
                    verbose: false,
                });
            },
            stderr: (message) => stderr.push(message),
        }), (error) => error instanceof FossilUsageError && error.exitCode === 2);
        assert.equal(analyzeCalls, 0);
        assert.match(stderr.join(""), /(?:error:|Usage: fossil analyze)/);
        assert.match(stderr.join(""), /Usage: fossil analyze/);
    }
});
test("returns and serializes the same finalized report through one analysis core", async () => {
    const options = {
        days: 90,
        gapHours: 48,
        threshold: 0.4,
        format: "json",
        extensions: [],
        untrackedAgeDays: 90,
        exclude: [],
        verbose: false,
    };
    const calls = [];
    const core = async (repositoryPath, coreOptions) => {
        calls.push({ repositoryPath, options: coreOptions });
        return reportFor(coreOptions);
    };
    const apiReport = await analyzeRepository("C:/repositories/parity", options, core);
    const stdout = [];
    await runFossilCli(["node", "fossil", "analyze", "C:/repositories/parity", "--format", "json"], {
        analyze: core,
        stdout: (message) => stdout.push(message),
    });
    assert.deepEqual(JSON.parse(stdout.join("")), apiReport);
    assert.deepEqual(calls, [
        { repositoryPath: "C:/repositories/parity", options },
        { repositoryPath: "C:/repositories/parity", options },
    ]);
});
test("rejects malformed direct API option shapes before calling the analysis core", async () => {
    for (const invalid of invalidDirectOptionShapes) {
        let coreCalls = 0;
        await assert.rejects(analyzeRepository("C:/repositories/invalid", { ...validDirectOptions, ...invalid }, async (_repositoryPath, coreOptions) => {
            coreCalls += 1;
            return reportFor(coreOptions);
        }), (error) => error instanceof FossilAnalysisError && error.code === "invalid_options");
        assert.equal(coreCalls, 0);
    }
});
test("reports zero findings after a completed empty analysis", async () => {
    const stdout = [];
    await runFossilCli(["node", "fossil", "analyze"], {
        analyze: async (_repositoryPath, options) => reportFor(options),
        stdout: (message) => stdout.push(message),
    });
    assert.equal(stdout.join(""), "0 findings\n");
});
test("retains sorted nonfatal warnings in successful API and CLI JSON reports", async () => {
    const options = {
        days: 90,
        gapHours: 48,
        threshold: 0.4,
        format: "json",
        extensions: [],
        untrackedAgeDays: 90,
        exclude: [],
        verbose: false,
    };
    const warnings = [
        { code: "workspace_unreadable", message: "workspace unreadable", path: "./zeta.txt" },
        { code: "reference_unreadable", message: "second reference unreadable", path: "src\\middle.ts" },
        { code: "empty_repository", message: "repository is empty" },
        { code: "reference_unreadable", message: "first reference unreadable", path: "./src/alpha.ts" },
    ];
    const report = { ...reportFor(options), warnings };
    const expectedWarnings = [warnings[2], warnings[3], warnings[1], warnings[0]];
    const stdout = [];
    const stderr = [];
    const apiReport = await analyzeRepository("C:/repositories/warnings", options, async () => report);
    const exitCode = await runFossilCliProcess(["node", "fossil", "analyze", "C:/repositories/warnings", "--format", "json"], {
        analyze: async () => report,
        stdout: (message) => stdout.push(message),
        stderr: (message) => stderr.push(message),
    });
    assert.equal(exitCode, 0);
    assert.equal(stderr.join(""), "");
    assert.deepEqual(apiReport.warnings, expectedWarnings);
    assert.deepEqual(JSON.parse(stdout.join("")).warnings, expectedWarnings);
    assert.deepEqual(report.warnings, warnings);
});
test("maps typed analysis failures to exit codes without success output", async () => {
    const cases = [
        ["invalid_options", 2],
        ["not_repository", 1],
        ["git_capability", 1],
        ["git_failure", 1],
        ["containment_failure", 1],
        ["resource_limit", 1],
    ];
    for (const [code, expectedExitCode] of cases) {
        const stdout = [];
        const stderr = [];
        const exitCode = await runFossilCliProcess(["node", "fossil", "analyze", "C:/repositories/failing", "--format", "json"], {
            analyze: async () => {
                throw new FossilAnalysisError({ code, message: `${code}: \u001b[31mfailed` });
            },
            stdout: (message) => stdout.push(message),
            stderr: (message) => stderr.push(message),
        });
        assert.equal(exitCode, expectedExitCode);
        assert.equal(stdout.join(""), "");
        assert.equal(stderr.length, 1);
        assert.equal(stderr[0].includes(`fossil: ${code}: \\x1b[31mfailed\n`), true);
        assert.equal(Buffer.byteLength(stderr[0]) <= 4_096, true);
    }
});
test("maps a non-repository analysis failure to one bounded stderr diagnostic and exit code one", async () => {
    const stdout = [];
    const stderr = [];
    const exitCode = await runFossilCliProcess(["node", "fossil", "analyze", "C:/not-a-repository"], {
        analyze: async () => {
            throw new NotRepositoryAnalysisError(`not a Git repository:\n\x1b[31m${"x".repeat(8_192)}`);
        },
        stdout: (message) => stdout.push(message),
        stderr: (message) => stderr.push(message),
    });
    assert.equal(exitCode, 1);
    assert.equal(stdout.join(""), "");
    assert.equal(stderr.length, 1);
    assert.match(stderr[0], /not a Git repository/);
    assert.match(stderr[0], /\\n\\x1b\[31m/);
    assert.equal([...stderr[0].slice(0, -1)].some((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
    }), false);
    assert.equal(Buffer.byteLength(stderr[0]) <= 4_096, true);
});
//# sourceMappingURL=index.test.js.map