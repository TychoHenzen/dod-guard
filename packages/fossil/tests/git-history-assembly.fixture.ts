export const HOUR = 60 * 60 * 1_000;

export function burstGroup(name: string, start: number) {
  return [
    {
      hash: `${name}-a`,
      committerTimestampMs: start,
      changes: [{ status: "added" as const, path: `${name}-a.ts` }],
    },
    {
      hash: `${name}-b`,
      committerTimestampMs: start + HOUR,
      changes: [{ status: "added" as const, path: `${name}-b.ts` }],
    },
    {
      hash: `${name}-c`,
      committerTimestampMs: start + 2 * HOUR,
      changes: [{ status: "added" as const, path: `${name}-c.ts` }],
    },
    {
      hash: `${name}-d`,
      committerTimestampMs: start + 3 * HOUR,
      changes: [{ status: "modified" as const, path: `${name}-a.ts` }],
    },
    {
      hash: `${name}-e`,
      committerTimestampMs: start + 4 * HOUR,
      changes: [{ status: "modified" as const, path: `${name}-b.ts` }],
    },
  ];
}
