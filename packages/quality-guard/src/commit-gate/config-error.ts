export class ConfigError extends Error {
  constructor(message: string) {
    super(`Invalid .quality-guard.json: ${message}`);
    this.name = "ConfigError";
  }
}
