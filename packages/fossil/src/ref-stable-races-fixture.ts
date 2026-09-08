import {
  readStableReferenceSources,
  type ReferenceSourceSnapshot,
} from "./ref-analyzer.js";
import { STABLE_RACE_SOURCES } from "./ref-stable-races-sources.js";

function snapshot({
  identity,
  isRegularFile = true,
  canonicalPath = `C:/repo/${identity}`,
  byteLength = 7,
}: {
  identity: string;
  isRegularFile?: boolean;
  canonicalPath?: string;
  byteLength?: number;
}): ReferenceSourceSnapshot {
  return { identity, isRegularFile, byteLength, canonicalPath };
}

function baseInspections(): Map<
  string,
  (ReferenceSourceSnapshot | undefined)[]
> {
  return new Map(
    STABLE_RACE_SOURCES.map((source) => [
      source.path,
      [
        snapshot({ identity: source.path }),
        snapshot({ identity: source.path }),
      ],
    ]),
  );
}

function addChangedInspections(
  inspections: Map<string, (ReferenceSourceSnapshot | undefined)[]>,
): void {
  inspections.set("src/disappeared.ts", [
    snapshot({ identity: "src/disappeared.ts" }),
    undefined,
  ]);
  inspections.set("src/type.ts", [
    snapshot({ identity: "src/type.ts" }),
    snapshot({ identity: "src/type.ts", isRegularFile: false }),
  ]);
  inspections.set("src/identity.ts", [
    snapshot({ identity: "old" }),
    snapshot({ identity: "new" }),
  ]);
  inspections.set("src/canonical.ts", [
    snapshot({ identity: "same" }),
    snapshot({ identity: "same", canonicalPath: "C:/private/outside.ts" }),
  ]);
  inspections.set("src/size.ts", [
    snapshot({ identity: "same" }),
    snapshot({ identity: "same", byteLength: 8 }),
  ]);
}

function createInspections(): Map<
  string,
  (ReferenceSourceSnapshot | undefined)[]
> {
  const inspections = baseInspections();
  addChangedInspections(inspections);
  return inspections;
}

export function runStableRaceScenario() {
  const inspections = createInspections();
  const inspectionReads: string[] = [];
  const contentReads: string[] = [];
  const result = readStableReferenceSources({
    sources: STABLE_RACE_SOURCES,
    boundary: {
      inspect: (source) => {
        inspectionReads.push(source.path);
        return inspections.get(source.path)?.shift();
      },
      read: (source) => {
        contentReads.push(source.path);
        if (source.path === "src/read-failure.ts")
          throw new Error("sensitive filesystem error");
        if (source.path === "src/binary.ts") return "text\0not-source";
        return `// ${source.path}\n`;
      },
    },
  });
  return {
    result,
    sources: STABLE_RACE_SOURCES,
    inspectionReads,
    contentReads,
  };
}
