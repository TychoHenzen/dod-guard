import type { AnalysisWarning, BurstFileActivity, GitCommit, GitFileChange, LogicalFileActivity } from "./types.js";

const RECORD_SEPARATOR = "\u001e";
const MIN_CHANGE_POINT_GAP_MS = 4 * 60 * 60 * 1_000;
const MAX_CHANGE_POINT_SIMILARITY = 0.1;

/** Arguments for the raw history stream consumed by parseNonMergeGitLog(). */
export function nonMergeGitLogArguments(): readonly string[] {
  return ["log", "HEAD", "--no-merges", "--find-renames=50%", "--format=%x1e%H%x00%ct%x00", "--name-status", "-z"];
}

/** Arguments for checking whether Git marks the repository as shallow. */
export function shallowRepositoryArguments(): readonly string[] {
  return ["rev-parse", "--is-shallow-repository"];
}

/** Turns Git's strict shallow-repository response into completeness evidence. */
export function shallowHistoryWarnings(result: string): AnalysisWarning[] {
  if (result === "true" || result === "true\n" || result === "true\r\n") {
    return [
      {
        code: "shallow_history",
        message: "Repository is shallow; burst and consolidation history may be incomplete.",
      },
    ];
  }

  if (result === "false" || result === "false\n" || result === "false\r\n") {
    return [];
  }

  throw new Error("Unexpected Git shallow-repository response");
}

/** Arguments for reading the sparse-checkout setting for the target worktree. */
export function sparseCheckoutArguments(): readonly string[] {
  return ["config", "--bool", "--get", "core.sparseCheckout"];
}

/** Turns Git's strict sparse-checkout response into current-tree completeness evidence. */
export function sparseCheckoutWarnings(result: string): AnalysisWarning[] {
  if (result === "true" || result === "true\n" || result === "true\r\n") {
    return [
      {
        code: "sparse_checkout",
        message: "Sparse checkout is enabled; current-file existence and references may be incomplete.",
      },
    ];
  }

  if (result === "" || result === "false" || result === "false\n" || result === "false\r\n") {
    return [];
  }

  throw new Error("Unexpected Git sparse-checkout response");
}

function statusFor(rawStatus: string): GitFileChange["status"] {
  switch (rawStatus[0]) {
    case "A":
      return "added";
    case "M":
      return "modified";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "C":
      return "copied";
    case "T":
      return "type-changed";
    case "U":
      return "unmerged";
    default:
      return "unknown";
  }
}

function parseChanges(tokens: readonly string[]): GitFileChange[] {
  const changes: GitFileChange[] = [];
  for (let index = 0; index < tokens.length; ) {
    const rawStatus = tokens[index]?.replace(/^\r?\n/, "");
    if (!rawStatus) {
      index += 1;
      continue;
    }
    const status = statusFor(rawStatus);
    const firstPath = tokens[index + 1];
    if (firstPath === undefined) break;
    if (status === "renamed" || status === "copied") {
      const path = tokens[index + 2];
      if (path === undefined) break;
      changes.push({ status, path, previousPath: firstPath });
      index += 3;
      continue;
    }
    changes.push({ status, path: firstPath });
    index += 2;
  }
  return changes;
}

/** Returns a chronological copy ordered by UTC epoch and ordinal commit hash. */
export function sortCommitsChronologically(commits: readonly GitCommit[]): GitCommit[] {
  return [...commits].sort(
    (left, right) =>
      left.committerTimestampMs - right.committerTimestampMs ||
      (left.hash < right.hash ? -1 : left.hash > right.hash ? 1 : 0),
  );
}

/** Reports future-dated commits as incomplete history evidence in deterministic order. */
export function futureCommitWarnings(commits: readonly GitCommit[], analysisTimestampMs: number): AnalysisWarning[] {
  return sortCommitsChronologically(commits)
    .filter((commit) => commit.committerTimestampMs > analysisTimestampMs)
    .map((commit) => ({
      code: "future_commit",
      message: `Commit ${commit.hash} has a committer timestamp after analysis time.`,
    }));
}

/** Parses the NUL-delimited non-merge stream requested by nonMergeGitLogArguments(). */
export function parseNonMergeGitLog(rawLog: string): GitCommit[] {
  const commits: GitCommit[] = [];
  for (const record of rawLog.split(RECORD_SEPARATOR)) {
    if (!record) continue;
    const tokens = record.split("\0");
    const hash = tokens[0];
    const committerSeconds = Number(tokens[1]);
    if (!(hash && Number.isFinite(committerSeconds))) continue;
    commits.push({
      hash,
      committerTimestampMs: committerSeconds * 1_000,
      changes: parseChanges(tokens.slice(2)),
    });
  }
  return sortCommitsChronologically(commits);
}

function pathExtension(path: string): string {
  const filename = path.slice(path.lastIndexOf("/") + 1);
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot).toLowerCase();
}

/** Normalizes extension options while preserving deterministic first-occurrence order. */
export function normalizeExtensions(values: readonly string[]): string[] {
  const normalized = new Set<string>();
  for (const value of values) normalized.add(`.${value.replace(/^\./, "").toLowerCase()}`);
  return [...normalized];
}

/** Keeps whole candidate identities for later burst and score calculations. */
export function filterHistoryByExtensions(commits: readonly GitCommit[], extensions: ReadonlySet<string>): GitCommit[] {
  if (extensions.size === 0) return [...commits];
  const resolution = resolveLogicalActivities(commits);
  const selectedIdentities = new Set(
    resolution.activities
      .filter((activity) => extensions.has(pathExtension(activity.currentPath ?? activity.paths.at(-1) ?? "")))
      .map((activity) => activity.identity),
  );
  return commits.flatMap((commit) => {
    const changes = commit.changes.filter((change) =>
      selectedIdentities.has(resolution.identitiesByChange.get(change) ?? ""),
    );
    return changes.length === 0 ? [] : [{ ...commit, changes }];
  });
}

/** Splits chronological included commits where the adjacent timestamp gap exceeds the supplied milliseconds. */
export function splitTemporalClusters(commits: readonly GitCommit[], gapMilliseconds: number): GitCommit[][] {
  if (gapMilliseconds < 0) throw new RangeError("gapMilliseconds must be nonnegative");
  const clusters: GitCommit[][] = [];
  for (const commit of commits) {
    const current = clusters.at(-1);
    const previous = current?.at(-1);
    if (!(current && previous) || commit.committerTimestampMs - previous.committerTimestampMs > gapMilliseconds) {
      clusters.push([commit]);
      continue;
    }
    current.push(commit);
  }
  return clusters;
}

interface LogicalIdentityResolution {
  readonly activities: readonly LogicalFileActivity[];
  readonly identitiesByChange: ReadonlyMap<GitFileChange, string>;
}

function fileIdentities(commits: readonly GitCommit[]): ReadonlyMap<GitFileChange, string> {
  return resolveLogicalActivities(commits).identitiesByChange;
}

function commitFiles(commit: GitCommit, identities: ReadonlyMap<GitFileChange, string>): Set<string> {
  return new Set(commit.changes.map((change) => identities.get(change) ?? change.path));
}

function partitionQualifies(commits: readonly GitCommit[], identities: ReadonlyMap<GitFileChange, string>): boolean {
  return commits.length >= 5 && new Set(commits.flatMap((commit) => [...commitFiles(commit, identities)])).size >= 3;
}

function weightedSimilarity(
  commits: readonly GitCommit[],
  cut: number,
  identities: ReadonlyMap<GitFileChange, string>,
): number {
  const touchedByCommit = commits.map((commit) => commitFiles(commit, identities));
  const touches = new Map<string, number>();
  for (const files of touchedByCommit) {
    for (const file of files) touches.set(file, (touches.get(file) ?? 0) + 1);
  }
  const left = new Set(touchedByCommit.slice(cut - 5, cut).flatMap((files) => [...files]));
  const right = new Set(touchedByCommit.slice(cut, cut + 5).flatMap((files) => [...files]));
  const union = new Set([...left, ...right]);
  if (union.size === 0) return 1;
  const weightFor = (file: string) => Math.log((1 + commits.length) / (1 + (touches.get(file) ?? 0))) + 1;
  const intersectionWeight = [...left]
    .filter((file) => right.has(file))
    .reduce((total, file) => total + weightFor(file), 0);
  const unionWeight = [...union].reduce((total, file) => total + weightFor(file), 0);
  return intersectionWeight / unionWeight;
}

interface ChangePointCandidate {
  readonly cut: number;
  readonly gapMilliseconds: number;
  readonly similarity: number;
}

function selectChangePoint(
  commits: readonly GitCommit[],
  start: number,
  end: number,
  identities: ReadonlyMap<GitFileChange, string>,
): ChangePointCandidate | undefined {
  const candidates: ChangePointCandidate[] = [];
  for (let cut = start + 5; cut <= end - 5; cut += 1) {
    const left = commits.slice(start, cut);
    const right = commits.slice(cut, end);
    const gapMilliseconds = commits[cut].committerTimestampMs - commits[cut - 1].committerTimestampMs;
    if (
      gapMilliseconds < MIN_CHANGE_POINT_GAP_MS ||
      !partitionQualifies(left, identities) ||
      !partitionQualifies(right, identities)
    )
      continue;
    const similarity = weightedSimilarity(commits, cut, identities);
    if (similarity <= MAX_CHANGE_POINT_SIMILARITY) candidates.push({ cut, gapMilliseconds, similarity });
  }
  return candidates.sort(
    (left, right) =>
      left.similarity - right.similarity || right.gapMilliseconds - left.gapMilliseconds || left.cut - right.cut,
  )[0];
}

function splitChangePoints(
  commits: readonly GitCommit[],
  start: number,
  end: number,
  identities: ReadonlyMap<GitFileChange, string>,
): GitCommit[][] {
  const candidate = selectChangePoint(commits, start, end, identities);
  if (!candidate) return [commits.slice(start, end)];
  return [
    ...splitChangePoints(commits, start, candidate.cut, identities),
    ...splitChangePoints(commits, candidate.cut, end, identities),
  ];
}

/** Splits qualifying close file-set changes in deterministic chronological order. */
export function splitAtChangePoint(commits: readonly GitCommit[]): GitCommit[][] {
  return splitChangePoints(commits, 0, commits.length, fileIdentities(commits));
}

/** Retains only clusters whose closed state was established by the caller. */
export function retainQualifiedClosedClusters(clusters: readonly (readonly GitCommit[])[]): GitCommit[][] {
  const identities = fileIdentities(clusters.flat());
  return clusters.filter((cluster) => partitionQualifies(cluster, identities)).map((cluster) => [...cluster]);
}

/** Retains temporal clusters that have remained inactive for the full configured gap. */
export function retainClosedTemporalClusters(
  clusters: readonly (readonly GitCommit[])[],
  analysisTimestampMs: number,
  gapMilliseconds: number,
): GitCommit[][] {
  if (gapMilliseconds < 0) throw new RangeError("gapMilliseconds must be nonnegative");
  return clusters
    .filter((cluster) => {
      const newest = cluster.at(-1);
      return (
        newest !== undefined &&
        !cluster.some((commit) => commit.committerTimestampMs > analysisTimestampMs) &&
        analysisTimestampMs - newest.committerTimestampMs >= gapMilliseconds
      );
    })
    .map((cluster) => [...cluster]);
}

/** Selects files that meet the absolute post-burst survivor threshold. */
export function selectAbsoluteSurvivors(files: readonly BurstFileActivity[]): BurstFileActivity[] {
  return files.filter((file) => file.postBurstCommits >= 3);
}

function maximumPostBurstCommits(files: readonly BurstFileActivity[]): number {
  return Math.max(0, ...files.map((file) => file.postBurstCommits));
}

/** Selects files meeting the positive relative post-burst survivor threshold. */
export function selectRelativeSurvivors(files: readonly BurstFileActivity[]): BurstFileActivity[] {
  const maximum = maximumPostBurstCommits(files);
  return maximum > 0 ? files.filter((file) => file.postBurstCommits >= 0.2 * maximum) : [];
}

/** Selects files meeting either the absolute or positive relative survivor threshold. */
export function selectSurvivors(files: readonly BurstFileActivity[]): BurstFileActivity[] {
  const maximum = maximumPostBurstCommits(files);
  return files.filter((file) => file.postBurstCommits >= 3 || (maximum > 0 && file.postBurstCommits >= 0.2 * maximum));
}

/** Selects current burst files that meet neither survivor rule. */
export function selectFossilCandidates(files: readonly BurstFileActivity[]): BurstFileActivity[] {
  const survivors = new Set(selectSurvivors(files));
  return files.filter((file) => file.existsAtHead && !survivors.has(file));
}

/** Selects deleted burst paths that meet neither survivor rule. */
export function selectDeletedNonSurvivorPaths(files: readonly BurstFileActivity[]): string[] {
  const survivors = new Set(selectSurvivors(files));
  return files.filter((file) => !(file.existsAtHead || survivors.has(file))).map((file) => file.path);
}

interface FileEvent {
  readonly change: GitFileChange;
  readonly commit: GitCommit;
}

interface LogicalIdentityState {
  readonly identity: string;
  readonly paths: string[];
  readonly events: FileEvent[];
  currentPath?: string;
}

function resolveLogicalActivities(commits: readonly GitCommit[]): LogicalIdentityResolution {
  const activeByPath = new Map<string, string>();
  const generationsByPath = new Map<string, number>();
  const identitiesByChange = new Map<GitFileChange, string>();
  const states = new Map<string, LogicalIdentityState>();
  const createIdentity = (path: string): string => {
    const generation = (generationsByPath.get(path) ?? 0) + 1;
    generationsByPath.set(path, generation);
    const identity = generation === 1 ? path : `${path}#${generation}`;
    states.set(identity, { identity, paths: [path], events: [], currentPath: path });
    activeByPath.set(path, identity);
    return identity;
  };
  const activeIdentity = (path: string): string => activeByPath.get(path) ?? createIdentity(path);
  const record = (identity: string, change: GitFileChange, commit: GitCommit): void => {
    const state = states.get(identity);
    if (!state) throw new Error(`Missing logical identity: ${identity}`);
    state.events.push({ change, commit });
    identitiesByChange.set(change, identity);
    if (change.status === "renamed" && change.previousPath && state.paths.at(-1) !== change.previousPath)
      state.paths.push(change.previousPath);
    if (state.paths.at(-1) !== change.path) state.paths.push(change.path);
  };

  for (const commit of sortCommitsChronologically(commits)) {
    for (const change of commit.changes) {
      if (change.status === "renamed") {
        const sourcePath = change.previousPath ?? change.path;
        const identity = activeIdentity(sourcePath);
        activeByPath.delete(sourcePath);
        activeByPath.set(change.path, identity);
        const state = states.get(identity);
        if (state) state.currentPath = change.path;
        record(identity, change, commit);
        continue;
      }
      if (change.status === "copied") {
        const identity = createIdentity(change.path);
        record(identity, change, commit);
        continue;
      }
      if (change.status === "added") {
        const identity = createIdentity(change.path);
        record(identity, change, commit);
        continue;
      }
      const identity = activeIdentity(change.path);
      record(identity, change, commit);
      if (change.status === "deleted") {
        activeByPath.delete(change.path);
        const state = states.get(identity);
        if (state) state.currentPath = undefined;
      }
    }
  }
  return {
    identitiesByChange,
    activities: [...states.values()].map((state) => {
      const timestamps = state.events.map(({ commit }) => commit.committerTimestampMs);
      return {
        identity: state.identity,
        currentPath: state.currentPath,
        paths: state.paths,
        firstCommitTimestampMs: Math.min(...timestamps),
        lastCommitTimestampMs: Math.max(...timestamps),
        commitCount: new Set(state.events.map(({ commit }) => commit.hash)).size,
        created: state.events.some(({ change }) => change.status === "added" || change.status === "copied"),
        deleted: state.currentPath === undefined,
        existsAtHead: state.currentPath !== undefined,
      };
    }),
  };
}

/** Collapses rename chains while keeping copies and path recreations as distinct identities. */
export function resolveRenameActivities(commits: readonly GitCommit[]): LogicalFileActivity[] {
  return [...resolveLogicalActivities(commits).activities];
}
