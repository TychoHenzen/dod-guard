export function createLspFrameStream(onMessage) {
  let output = Buffer.alloc(0);
  return (chunk) => {
    output = Buffer.concat([output, chunk]);
    while (true) {
      const boundary = output.indexOf("\r\n\r\n");
      if (boundary < 0) return;
      const headers = output.subarray(0, boundary).toString("ascii").split("\r\n");
      const length = Number(headers.find((header) => header.toLowerCase().startsWith("content-length:"))?.split(":")[1]);
      if (!(Number.isSafeInteger(length) && length >= 0) || output.length < boundary + 4 + length) return;
      const message = JSON.parse(output.subarray(boundary + 4, boundary + 4 + length).toString("utf8"));
      output = output.subarray(boundary + 4 + length);
      if (onMessage(message) === false) return;
    }
  };
}
