export type NativeManifestOptions = {
  root: string;
  supported: (path: string) => boolean;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
};
