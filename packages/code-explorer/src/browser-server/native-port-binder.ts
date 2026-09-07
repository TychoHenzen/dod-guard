import type { HttpListener } from "./http-listener.js";
import { closeServer, waitForListening } from "./native-port-lifecycle.js";
import { createNativeServer } from "./native-port-server.js";
import type { PortBinder } from "./port-binder.js";

function listenerFor(
  host: string,
  port: number,
  server: ReturnType<typeof createNativeServer>,
): HttpListener {
  return {
    address: new URL(`http://${host}:${port}/`),
    stopAdmission: () => {
      server.admission.open = false;
    },
    close: async (signal) => {
      if (server.server.listening)
        await closeServer(server.server, server.sockets, signal);
    },
  };
}

async function listen(
  ...args: Parameters<PortBinder["listen"]>
): Promise<HttpListener> {
  const [host, port, signal, core] = args;
  if (signal.aborted) throw new Error("aborted");
  const nativeServer = createNativeServer(host, port, core);
  await waitForListening({ server: nativeServer.server, port, host, signal });
  return listenerFor(host, port, nativeServer);
}

export const nativePortBinder: PortBinder = { listen };
