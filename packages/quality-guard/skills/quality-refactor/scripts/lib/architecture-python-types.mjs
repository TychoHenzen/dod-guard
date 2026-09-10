function indentation(line) {
  return /^[ \t]*/.exec(line)[0].replace(/\t/g, "    ").length;
}

function pythonEnd(lines, start, indent) {
  let end = start + 1;
  while (end < lines.length) {
    const line = lines[end];
    if (line.trim() !== "" && indentation(line) <= indent) break;
    end += 1;
  }
  return end;
}

export function pythonTypes(source) {
  const lines = source.split("\n");
  const result = [];
  let offset = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(\s*)class\s+([A-Za-z_]\w*)/.exec(lines[index]);
    if (!match) {
      offset += lines[index].length + 1;
      continue;
    }
    const end = pythonEnd(lines, index, indentation(match[1]));
    const bodyStart = offset + lines[index].length + 1;
    const bodyEnd = bodyStart + lines.slice(index + 1, end).join("\n").length;
    result.push({
      kind: "class",
      name: match[2],
      start: offset,
      body: {
        start: bodyStart,
        end: bodyEnd,
        text: source.slice(bodyStart, bodyEnd),
      },
    });
    offset += lines[index].length + 1;
  }
  return result;
}
