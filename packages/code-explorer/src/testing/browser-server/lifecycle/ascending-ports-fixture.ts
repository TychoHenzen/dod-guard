import { busyPort } from "./busy-port-fixture.js";
import { fakeListener } from "./fake-listener-fixture.js";
export function ascendingPorts(attempts: number[]) {
  return {
    listen: async (_host: string, port: number) => {
      attempts.push(port);
      if (port < 4412) return busyPort();
      return fakeListener(port, []);
    },
  };
}
