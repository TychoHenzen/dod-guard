import { request } from "node:http";
export async function post(
  url: URL,
  body: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const request_ = request(
      url,
      { method: "POST", headers: { "content-type": "application/json" } },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () =>
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    request_.once("error", reject);
    request_.end(body);
  });
}
