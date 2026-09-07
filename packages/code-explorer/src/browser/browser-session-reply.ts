export type BrowserSessionReply = {
  state: string;
  data?: { browser_session_id?: string; root_access?: string };
};
