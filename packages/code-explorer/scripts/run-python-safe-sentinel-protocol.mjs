export function isConfigurationRequest(message) {
  return (
    message.method === "workspace/configuration" && message.id !== undefined
  );
}

export function isInitializeResponse(message, initialized) {
  return message.id === 1 && message.method === undefined && !initialized;
}

export function sendMessage(child, message) {
  const body = JSON.stringify(message);
  child.stdin.write(
    `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
  );
}

export function sendInitialization(child, mirror, root) {
  const uri = mirror.uriFor("src/fixture.py");
  const text = root.protectedRead("src/fixture.py").bytes;
  sendMessage(child, { jsonrpc: "2.0", method: "initialized", params: {} });
  sendMessage(child, {
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: { textDocument: { uri, languageId: "python", version: 1, text } },
  });
  sendMessage(child, {
    jsonrpc: "2.0",
    id: 2,
    method: "textDocument/definition",
    params: { textDocument: { uri }, position: { line: 0, character: 7 } },
  });
}

export function sendConfiguration(child, message) {
  const items = message.params?.items ?? [];
  sendMessage(child, {
    jsonrpc: "2.0",
    id: message.id,
    result: items.map((item) =>
      [
        "python.pythonPath",
        "python.venvPath",
        "python.analysis.extraPaths",
      ].includes(item.section)
        ? []
        : null,
    ),
  });
}
