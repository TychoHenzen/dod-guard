function nextFrame(output) {
  const boundary = output.indexOf("\r\n\r\n");
  if (boundary < 0) return;
  const headers = output.subarray(0, boundary).toString("ascii").split("\r\n");
  const length = Number(
    headers
      .find((header) => header.toLowerCase().startsWith("content-length:"))
      ?.split(":")[1],
  );
  const end = boundary + 4 + length;
  if (!(Number.isSafeInteger(length) && length >= 0) || output.length < end)
    return;
  return {
    message: JSON.parse(output.subarray(boundary + 4, end).toString("utf8")),
    output: output.subarray(end),
  };
}

export function createLspFrameStream(onMessage) {
  let output = Buffer.alloc(0);
  return (chunk) => {
    output = Buffer.concat([output, chunk]);
    while (true) {
      const frame = nextFrame(output);
      if (!frame) return;
      output = frame.output;
      if (onMessage(frame.message) === false) return;
    }
  };
}
