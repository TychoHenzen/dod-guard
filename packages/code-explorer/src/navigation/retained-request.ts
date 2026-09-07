export type RetainedRequest<T> = {
  fingerprint: string;
  expiresAt: number;
  response: Promise<T>;
};
