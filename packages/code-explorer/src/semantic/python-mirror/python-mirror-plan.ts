export type PythonMirrorPlan =
  | { status: "unavailable"; code: "unsafe_backend_mode" }
  | {
      status: "ready";
      manifest: Readonly<Record<string, string>>;
      files: readonly Readonly<{
        path: string;
        sha256: string;
        text: string;
      }>[];
      generation: number;
      minimal_pyrightconfig: Readonly<Record<string, never>>;
      bundled_typeshed: readonly string[];
      resolveUri: (
        uri: string,
        generation: number,
        sha256: string,
      ) =>
        | { status: "accepted"; original_path: string }
        | {
            status: "rejected";
            code: "unsafe_backend_mode";
          };
      onProjectConfigurationChanged: () => {
        status: "rebuild_required";
        terminate_old_backend: true;
      };
    };
