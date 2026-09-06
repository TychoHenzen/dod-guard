import type { PythonMirror } from "./python-mirror-type.js";

export type PythonMirrorApi = {
  mirror: PythonMirror;
  manager: {
    current(): PythonMirrorApi["mirror"] | undefined;
    refresh(): Promise<
      | {
          status: "ready";
          mirror: PythonMirrorApi["mirror"];
          changed: boolean;
        }
      | {
          status: "unavailable";
          code: "unsafe_backend_mode";
        }
    >;
    disposeAfterShutdown(shutdown: () => void | Promise<void>): Promise<void>;
  };
};
