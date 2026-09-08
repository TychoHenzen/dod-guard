import { splitAtChangePoint } from "./git-analyzer.js";

export function changePointCommits(
  fileSets: readonly (readonly string[])[],
  gapsBefore: ReadonlyMap<number, number>,
) {
  let timestamp = 0;
  return fileSets.map((paths, index) => {
    if (index > 0) timestamp += gapsBefore.get(index) ?? 60 * 60 * 1_000;
    return {
      hash: `point-${index}`,
      committerTimestampMs: timestamp,
      changes: paths.map((path) => ({ status: "modified" as const, path })),
    };
  });
}

export function changePointPartitionLengths(
  fileSets: readonly (readonly string[])[],
  gapsBefore: ReadonlyMap<number, number>,
) {
  return splitAtChangePoint(changePointCommits(fileSets, gapsBefore)).map(
    (partition) => partition.length,
  );
}

function fileActivity(input: {
  identity: string;
  path: string;
  burstCommits: number;
  postBurstCommits: number;
  createdInBurst: boolean;
  existsAtHead: boolean;
}) {
  return { ...input };
}

export const maximumFileActivity = fileActivity({
  identity: "maximum",
  path: "maximum.ts",
  burstCommits: 1,
  postBurstCommits: 100,
  createdInBurst: true,
  existsAtHead: true,
});
