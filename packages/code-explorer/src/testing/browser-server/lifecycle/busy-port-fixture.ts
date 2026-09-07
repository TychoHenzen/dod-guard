export async function busyPort(): Promise<never> {
  throw Object.assign(new Error("busy"), { code: "EADDRINUSE" });
}
