export type BrowserHttpResponse = {
  status: number;
  headers: Record<string, string>;
  body: string;
};
