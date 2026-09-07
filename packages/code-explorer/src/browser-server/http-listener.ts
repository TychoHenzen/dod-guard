export type HttpListener = {
  readonly address: URL;
  stopAdmission(): void;
  close(signal: AbortSignal): Promise<void>;
};
