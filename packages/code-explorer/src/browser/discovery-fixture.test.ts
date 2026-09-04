export type DiscoveryTestReply = { data: Record<string, unknown> };

export function fakeDiscoveryCore(replies: DiscoveryTestReply[]) {
  const calls: Record<string, unknown>[] = [];
  return {
    calls,
    search: async (request: Record<string, unknown>) => {
      calls.push(request);
      const reply = replies.shift();
      if (!reply) throw new Error("missing_fake_reply");
      return reply;
    },
  };
}
