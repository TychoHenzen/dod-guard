import { SessionManager } from "../../../../src/navigation/session.js";

export function sessionFixture() {
  const sessions = new SessionManager();
  return { sessions, sessionId: sessions.start("connection") };
}
