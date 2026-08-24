import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { FossilAnalysisError } from "./analysis-error.js";
import { abandonmentScore, candidateReferenceSubscores, createAdvisoryFossilFinding, normalizedBurstChurn, scoreFossilSubscores, } from "./fossil-grader.js";
import * as history from "./git-analyzer.js";
import { assertSupportedGitVersion, runGitCommand } from "./git-process.js";
import { finalizeFossilReport } from "./output.js";
import { analyzeReferences, markUnresolvedCandidateEvidence, readStableReferenceSources, regradeVestigialEdges, unsupportedCandidateReferenceGraph, } from "./ref-analyzer.js";
import { CHECK_IGNORE_ARGUMENTS, filterWorkspaceDiscoveryPaths, IGNORED_DISCOVERY_ARGUMENTS, inspectWorkspaceFileMetadataWithWarnings, oldIgnoredWorkspaceCandidates, oldUntrackedWorkspaceCandidates, parseNulDelimitedPaths, parseVerboseCheckIgnore, UNTRACKED_DISCOVERY_ARGUMENTS, workspaceDebrisFinding, } from "./workspace-debris.js";
const MEBIBYTE = 1_024 * 1_024;
function languageForPath(path) {
    const extension = path.slice(path.lastIndexOf(".")).toLowerCase();
    if ([".ts", ".tsx"].includes(extension))
        return "typescript";
    if ([".js", ".jsx", ".mjs", ".cjs"].includes(extension))
        return "javascript";
    if (extension === ".cs")
        return "csharp";
    if (extension === ".rs")
        return "rust";
    return "unsupported";
}
function gitFailure(message) {
    return new FossilAnalysisError({ code: "git_failure", message });
}
function emptyHistoryOutput() {
    return { exitCode: 0, stdout: "", stderr: "", stdoutBytes: 0, stderrBytes: 0, statusRecordCount: 0 };
}
async function successfulGit(runGit, arguments_, repositoryPath, input, historyMode = false) {
    let result;
    try {
        result = await runGit(arguments_, repositoryPath, input, historyMode);
    }
    catch {
        throw gitFailure("Git command could not be started or read.");
    }
    if (result.exitCode === 0)
        return result;
    throw gitFailure("Git command failed during repository analysis.");
}
function referenceSources(root, paths) {
    const candidates = paths.map((path) => ({ path, language: languageForPath(path) }));
    const supported = candidates.filter((candidate) => candidate.language !== "unsupported");
    const reads = readStableReferenceSources(supported, {
        inspect(source) {
            const fullPath = join(root, source.path);
            const metadata = lstatSync(fullPath);
            return {
                identity: `${metadata.dev}:${metadata.ino}`,
                isRegularFile: metadata.isFile(),
                byteLength: metadata.size,
                canonicalPath: realpathSync(fullPath),
            };
        },
        read(source) {
            return readFileSync(join(root, source.path), "utf8");
        },
    });
    const unsupported = unsupportedCandidateReferenceGraph(candidates);
    const graph = analyzeReferences(reads.sources);
    return {
        sources: reads.sources,
        warnings: reads.warnings,
        acceptedBytes: reads.acceptedBytes,
        graph: {
            ...graph,
            complete: reads.graph.complete && unsupported.complete,
            unavailablePaths: [...new Set([...reads.graph.unavailablePaths, ...unsupported.unavailablePaths])].sort(),
        },
    };
}
/** Composes safe Git, source, scoring, and workspace boundaries into a truthful repository report. */
/** Composes safe Git, source, scoring, and workspace boundaries into a truthful repository report. */
export async function analyzeRepositoryCore(repositoryPath, options, runGit = runGitCommand) {
    const version = await successfulGit(runGit, ["--version"]);
    assertSupportedGitVersion(version.stdout);
    const discovery = await runGit(["rev-parse", "--show-toplevel"], repositoryPath);
    if (discovery.exitCode !== 0)
        throw new FossilAnalysisError({ code: "not_repository", message: "Not a Git repository." });
    const prefix = await successfulGit(runGit, ["rev-parse", "--show-prefix"], repositoryPath);
    const root = resolve(realpathSync(repositoryPath), ...prefix.stdout
        .trim()
        .split("/")
        .filter(Boolean)
        .map(() => ".."));
    const analysisTimestampMs = Date.now();
    const head = await runGit(["rev-parse", "--verify", "HEAD"], root);
    const historyOutput = head.exitCode === 0
        ? await successfulGit(runGit, history.nonMergeGitLogArguments(), root, undefined, true)
        : emptyHistoryOutput();
    const parsedHistory = history.parseNonMergeGitLog(historyOutput.stdout);
    const minimumTimestamp = analysisTimestampMs - options.days * 24 * 60 * 60 * 1_000;
    const includedHistory = history.filterHistoryByExtensions(parsedHistory.filter((commit) => commit.committerTimestampMs >= minimumTimestamp), new Set(history.normalizeExtensions(options.extensions)));
    const shallow = await successfulGit(runGit, history.shallowRepositoryArguments(), root);
    const sparse = await successfulGit(runGit, history.sparseCheckoutArguments(), root).catch((error) => {
        if (error instanceof FossilAnalysisError)
            return { stdout: "", stdoutBytes: 0, stderrBytes: 0 };
        throw error;
    });
    const submodules = await successfulGit(runGit, ["submodule", "status", "--recursive"], root);
    const warnings = [
        ...history.emptyHistoryWarnings(includedHistory),
        ...history.futureCommitWarnings(includedHistory, analysisTimestampMs),
        ...history.shallowHistoryWarnings(shallow.stdout),
        ...history.sparseCheckoutWarnings(sparse.stdout),
        ...(submodules.stdout.trim() === ""
            ? []
            : [{ code: "submodule_omitted", message: "Submodule contents are omitted from repository analysis." }]),
    ];
    const bursts = history.assembleClosedBursts(includedHistory, history.retainQualifiedClosedClusters(history.retainClosedTemporalClusters(history.splitTemporalClusters(includedHistory, options.gapHours * 60 * 60 * 1_000), analysisTimestampMs, options.gapHours * 60 * 60 * 1_000)));
    const trackedOutput = await successfulGit(runGit, ["ls-files", "-z"], root);
    const untrackedOutput = await successfulGit(runGit, UNTRACKED_DISCOVERY_ARGUMENTS, root);
    const ignoredOutput = await successfulGit(runGit, IGNORED_DISCOVERY_ARGUMENTS, root);
    const untracked = parseNulDelimitedPaths(untrackedOutput.stdout);
    const ignored = parseNulDelimitedPaths(ignoredOutput.stdout);
    const inspect = (path) => {
        const metadata = lstatSync(join(root, path));
        return {
            path,
            isRegularFile: metadata.isFile(),
            isSymbolicLink: metadata.isSymbolicLink(),
            modifiedTimestampMs: metadata.mtimeMs,
        };
    };
    const untrackedMetadata = inspectWorkspaceFileMetadataWithWarnings(untracked, inspect, options.exclude);
    const ignoredMetadata = inspectWorkspaceFileMetadataWithWarnings(ignored, inspect, options.exclude);
    warnings.push(...untrackedMetadata.warnings, ...ignoredMetadata.warnings);
    const filteredIgnored = filterWorkspaceDiscoveryPaths(ignored, options.exclude);
    const ignoreOutput = filteredIgnored.length === 0
        ? undefined
        : await successfulGit(runGit, CHECK_IGNORE_ARGUMENTS, root, `${filteredIgnored.join("\0")}\0`);
    const ignoredProvenance = parseVerboseCheckIgnore(ignoreOutput?.stdout ?? "");
    const workspaceCandidates = [
        ...oldUntrackedWorkspaceCandidates(untrackedMetadata.metadata, analysisTimestampMs, options.untrackedAgeDays),
        ...oldIgnoredWorkspaceCandidates(ignoredMetadata.metadata, ignoredProvenance, analysisTimestampMs, options.untrackedAgeDays),
    ];
    const inventory = [
        ...new Set([...parseNulDelimitedPaths(trackedOutput.stdout), ...workspaceCandidates.map(({ path }) => path)]),
    ].sort();
    if (inventory.length > 100_000)
        throw new FossilAnalysisError({ code: "resource_limit", message: "File inventory limit exceeded." });
    const references = referenceSources(root, inventory);
    warnings.push(...references.warnings);
    const reports = bursts.map((burst) => {
        const candidates = history.selectFossilCandidates(burst.files);
        const candidatePaths = new Set(candidates.map((candidate) => candidate.path));
        const graph = markUnresolvedCandidateEvidence(regradeVestigialEdges(references.graph, candidatePaths), candidatePaths);
        const findings = candidates.flatMap((candidate) => {
            const reference = candidateReferenceSubscores(candidate.path, graph, candidatePaths);
            const score = scoreFossilSubscores({
                churn: normalizedBurstChurn(candidate, burst.files),
                abandonment: abandonmentScore(candidate),
                ...(reference.available
                    ? { referenceWeakness: reference.referenceWeakness, clusterIsolation: reference.clusterIsolation }
                    : {}),
            });
            if (!(score && score.score >= options.threshold))
                return [];
            const inbound = new Set(graph.edges
                .filter((edge) => edge.targetPath === candidate.path && edge.strength === "strong" && !candidatePaths.has(edge.sourcePath))
                .map((edge) => edge.sourcePath));
            const neighbors = new Set(graph.edges.flatMap((edge) => edge.sourcePath === candidate.path
                ? [edge.targetPath]
                : edge.targetPath === candidate.path
                    ? [edge.sourcePath]
                    : []));
            return [
                createAdvisoryFossilFinding({
                    burstId: burst.id,
                    path: candidate.path,
                    activity: candidate,
                    score: score.score,
                    scoreBasis: score.basis,
                    subscores: {
                        churn: normalizedBurstChurn(candidate, burst.files),
                        abandonment: abandonmentScore(candidate),
                        ...(reference.available
                            ? { referenceWeakness: reference.referenceWeakness, clusterIsolation: reference.clusterIsolation }
                            : {}),
                    },
                    referenceAvailability: reference.available ? "complete" : "unavailable",
                    strongInboundReferences: inbound.size,
                    candidateNeighbors: [...neighbors].filter((path) => candidatePaths.has(path)).sort(),
                    liveNeighbors: [...neighbors].filter((path) => !candidatePaths.has(path)).sort(),
                }),
            ];
        });
        return {
            id: burst.id,
            startTimestampMs: burst.startTimestampMs,
            endTimestampMs: burst.endTimestampMs,
            commitCount: burst.commits.length,
            fileCount: burst.files.length,
            survivors: history.selectSurvivors(burst.files),
            findings,
            deletedPaths: history.selectDeletedNonSurvivorPaths(burst.files),
        };
    });
    const workspaceDebris = workspaceCandidates.flatMap((candidate) => {
        const finding = workspaceDebrisFinding(candidate, references.sources, inventory, root, [
            "dynamic runtime loading",
            "reflection",
            "external consumers",
            "generated configuration",
        ]);
        return finding ? [finding] : [];
    });
    const gitOutputs = [
        version,
        discovery,
        prefix,
        head,
        historyOutput,
        shallow,
        sparse,
        submodules,
        trackedOutput,
        untrackedOutput,
        ignoredOutput,
        ignoreOutput,
    ].filter((output) => output !== undefined);
    return finalizeFossilReport({
        schemaVersion: 1,
        options,
        analysisTimestampMs,
        gitVersion: version.stdout.trim(),
        boundary: {
            repositoryRoot: repositoryPath,
            canonicalRepositoryRoot: root,
            unobservedMechanisms: ["dynamic runtime loading", "reflection", "external consumers", "generated configuration"],
        },
        limits: {
            maximumCommits: 100_000,
            maximumFileStatusRecords: 1_000_000,
            maximumInventoriedFiles: 100_000,
            maximumGitStdoutBytes: 256 * MEBIBYTE,
            maximumGitStderrBytes: MEBIBYTE,
            maximumReferenceFileBytes: MEBIBYTE,
            maximumReferenceTotalBytes: 256 * MEBIBYTE,
        },
        usage: {
            commitRecords: includedHistory.length,
            fileStatusRecords: historyOutput.statusRecordCount,
            inventoriedFiles: inventory.length,
            gitStdoutBytes: gitOutputs.reduce((total, output) => total + output.stdoutBytes, 0),
            gitStderrBytes: gitOutputs.reduce((total, output) => total + output.stderrBytes, 0),
            referenceBytes: references.acceptedBytes,
            omittedReferencePaths: references.graph.unavailablePaths.length,
        },
        completeness: {
            historyComplete: !warnings.some((warning) => ["empty_repository", "future_commit", "shallow_history"].includes(warning.code)),
            referenceAnalysisComplete: references.graph.complete && !warnings.some((warning) => warning.code === "sparse_checkout"),
            workspaceDebrisComplete: !warnings.some((warning) => warning.code === "sparse_checkout"),
        },
        statistics: {
            includedCommitCount: includedHistory.length,
            logicalFileCount: history.resolveRenameActivities(includedHistory).length,
            burstCount: reports.length,
            candidateFindingCount: 0,
            uniqueCandidatePathCount: 0,
            workspaceDebrisCount: workspaceDebris.length,
        },
        warnings,
        bursts: reports,
        workspaceDebris,
    });
}
//# sourceMappingURL=repository-analysis.js.map