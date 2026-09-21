import assert from "node:assert/strict";
import { test } from "node:test";
import { designFacts } from "../../../../../skills/quality-refactor/scripts/lib/design-smells/design-facts.mjs";

test("finds explicit two-hop receiver chains across supported languages", () => {
  const fixtures = [
    ["ts", "class Service { run() { return this.client.get().store().save(); } }"],
    ["cs", "class Service { void Run() { return this.client.Get().Store().Save(); } }"],
    ["py", "class Service:\n    def run(self):\n        return self.client.get().store().save()\n"],
    ["rs", "struct Service { client: Client }\nimpl Service { fn run(&self) { self.client.get().store().save(); } }"],
  ];
  for (const [lang, source] of fixtures) {
    const [fact] = designFacts(source, lang).transitiveNavigation;
    assert.deepEqual(
      fact && { root: fact.root, hops: fact.hops },
      {
        root: "client",
        hops: lang === "cs" ? ["Get", "Store", "Save"] : ["get", "store", "save"],
      },
      lang,
    );
  }
});

test("ignores local, optional, and argument-bearing chains", () => {
  for (const source of [
    "class Service { run() { const client = this.client; return client.get().store().save(); } }",
    "class Service { run() { return this.client?.get().store().save(); } }",
    "class Service { run(id: string) { return this.client.get(id).store().save(); } }",
  ])
    assert.deepEqual(designFacts(source, "ts").transitiveNavigation, []);
});
