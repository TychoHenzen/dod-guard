import { type HttpListener } from "../../../browser-server/lifecycle.js";
export function fakeListener(port: number, stopped: number[]): HttpListener {
  return {
    address: new URL(`http://127.0.0.1:${port}/`),
    stopAdmission: () => stopped.push(port),
    close: async () => undefined,
  };
}
