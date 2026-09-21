export function isolatedEnvironment(workdir: string): NodeJS.ProcessEnv {
  const names =
    process.platform === "win32"
      ? ["PATH", "Path", "PATHEXT", "SystemRoot", "WINDIR"]
      : ["PATH", "HOME", "LANG", "LC_ALL"];
  const environment: NodeJS.ProcessEnv = {};
  for (const name of names) {
    if (process.env[name]) environment[name] = process.env[name];
  }
  if (process.platform === "win32") {
    environment.TEMP = workdir;
    environment.TMP = workdir;
    return environment;
  }
  environment.TMPDIR = workdir;
  return environment;
}
