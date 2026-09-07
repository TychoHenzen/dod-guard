export type FixtureBehavior = {
  failFocus: boolean;
  failRefresh: boolean;
  delays: Map<string, Promise<void>>;
};
