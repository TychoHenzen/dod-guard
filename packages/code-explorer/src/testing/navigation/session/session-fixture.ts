import { SessionManager } from "../../../navigation/session.js";

export function sessionFixture() {
  const sessions = new SessionManager();
  return { sessions, sessionId: sessions.start("connection") };
}
