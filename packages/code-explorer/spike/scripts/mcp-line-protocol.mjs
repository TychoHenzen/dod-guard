export function captureJsonLines(child, parse = JSON.parse) {
  const messages = [];
  const stderr = [];
  let buffer = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    for (;;) {
      const lineEnd = buffer.indexOf("\n");
      if (lineEnd < 0) break;
      const line = buffer.slice(0, lineEnd).trim();
      buffer = buffer.slice(lineEnd + 1);
      if (line) messages.push(parse(line));
    }
  });
  return { messages, stderr };
}
