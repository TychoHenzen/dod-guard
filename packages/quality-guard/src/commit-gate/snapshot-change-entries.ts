type EntryInput = {
  values: string[];
  index: number;
  contentSpec: (filePath: string, after: boolean) => string;
  readContent: (spec: string) => string;
};

function renameChange(input: EntryInput) {
  const beforePath = input.values[input.index + 1];
  const afterPath = input.values[input.index + 2];
  return {
    next: input.index + 2,
    change: {
      kind: "rename" as const,
      before: {
        path: beforePath,
        content: input.readContent(input.contentSpec(beforePath, false)),
      },
      after: {
        path: afterPath,
        content: input.readContent(input.contentSpec(afterPath, true)),
      },
    },
  };
}

function addedChange(input: EntryInput, filePath: string) {
  return {
    kind: "add" as const,
    after: {
      path: filePath,
      content: input.readContent(input.contentSpec(filePath, true)),
    },
  };
}

function deletedChange(input: EntryInput, filePath: string) {
  return {
    kind: "delete" as const,
    before: {
      path: filePath,
      content: input.readContent(input.contentSpec(filePath, false)),
    },
  };
}

function modifiedChange(input: EntryInput, filePath: string) {
  return {
    kind: "modify" as const,
    before: {
      path: filePath,
      content: input.readContent(input.contentSpec(filePath, false)),
    },
    after: {
      path: filePath,
      content: input.readContent(input.contentSpec(filePath, true)),
    },
  };
}

function fileChange(input: EntryInput, code: string, filePath: string) {
  if (code === "A") return addedChange(input, filePath);
  if (code === "D") return deletedChange(input, filePath);
  return modifiedChange(input, filePath);
}

export function changeAt(input: EntryInput) {
  const status = input.values[input.index];
  if (!status) return { next: input.index, change: undefined };
  if (status[0] === "R" || status[0] === "C") return renameChange(input);
  return {
    next: input.index + 1,
    change: fileChange(input, status[0], input.values[input.index + 1]),
  };
}
