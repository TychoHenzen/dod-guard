export const prohibitedPythonConfigurationKeys = [
  "extends",
  "venvPath",
  "venv",
  "extraPaths",
  "typeshedPath",
  "stubPath",
  "executionEnvironments",
  "pythonPath",
  "python.pythonPath",
  "python.venvPath",
  "python.analysis.extraPaths",
] as const;

export type PythonMirrorOptions = {
  generation: number;
  mirror_uri_root: string;
  bundled_typeshed: readonly string[];
};
