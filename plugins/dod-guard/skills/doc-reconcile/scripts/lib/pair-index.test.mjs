import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPairs } from "./pair-index.mjs";

const unit = (file, startLine, heading, text) => ({
  file,
  startLine,
  endLine: startLine,
  kind: "paragraph",
  heading,
  text,
});

describe("buildPairs", () => {
  it("returns a pair scoring above threshold", () => {
    // Shared: restart, server, config (3 of 5 union tokens) -> jaccard 0.6.
    // Corpus has only 2 claims, so every shared token also clears the rare
    // cutoff (freq <= 2), adding a bonus that caps the total at 1.
    const a = unit("a.md", 1, "H1", "restart the server after config change");
    const b = unit("b.md", 1, "H1", "restart server after config update");
    const pairs = buildPairs([a, b], { minTokens: 0 });
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0].score, 1);
    assert.equal(pairs[0].a, a);
    assert.equal(pairs[0].b, b);
  });

  it("drops a pair scoring below threshold", () => {
    // A and B share only "today" (jaccard 1/7 = 0.142857...). C also carries
    // "today", pushing its corpus frequency to 3, so it does not count as
    // rare and earns no bonus. Every pair here stays under 0.35.
    const a = unit("a.md", 1, "H1", "restart the server carefully today");
    const b = unit("b.md", 1, "H1", "logs show errors today");
    const c = unit("c.md", 1, "H1", "today is a bonus day filler");
    const pairs = buildPairs([a, b, c], { minTokens: 0 });
    assert.deepEqual(pairs, []);
  });

  it("never pairs two units in the same file under the same heading", () => {
    const a = unit("doc.md", 1, "Setup", "restart the server after config change");
    const b = unit("doc.md", 10, "Setup", "restart server after config update");
    assert.deepEqual(buildPairs([a, b], { minTokens: 0 }), []);
  });

  it("pairs two units in the same file under different headings", () => {
    const a = unit("doc.md", 1, "Setup", "restart the server after config change");
    const b = unit("doc.md", 10, "Teardown", "restart server after config update");
    const pairs = buildPairs([a, b], { minTokens: 0 });
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0].a, a);
    assert.equal(pairs[0].b, b);
  });

  it("lets a shared rare token lift a pair above a prose-only pair", () => {
    // claim1/claim2 share only "packages/x/shared.js" (jaccard 1/8 = 0.125).
    // That path appears in exactly these 2 of the 4 claims (freq 2, rare),
    // adding a 0.25 bonus for a final score of 0.375 (above 0.35).
    // claim3/claim4 share only "common" (jaccard 1/7 = 0.142857...). It also
    // appears in claim1. Its corpus frequency is 3, so it is not rare.
    // No bonus applies, so the score stays at 0.142857, below 0.35.
    const claim1 = unit("a.md", 1, "H1", "alpha beta gamma common packages/x/shared.js");
    const claim2 = unit("b.md", 1, "H1", "delta epsilon zeta packages/x/shared.js");
    const claim3 = unit("c.md", 1, "H1", "eta theta iota common");
    const claim4 = unit("d.md", 1, "H1", "kappa lambda mu common");
    const claims = [claim1, claim2, claim3, claim4];
    const pairs = buildPairs(claims, { minTokens: 0 });
    const pathPair = pairs.find((p) => p.a === claim1 && p.b === claim2);
    assert.ok(pathPair, "expected the path-sharing pair to survive");
    assert.equal(pathPair.score, 0.375);
    const prosePair = pairs.find(
      (p) => (p.a === claim3 && p.b === claim4) || (p.a === claim4 && p.b === claim3),
    );
    assert.equal(prosePair, undefined);
  });

  it("caps a claim's survivors at maxPerClaim, keeping the highest scores", () => {
    // H = {p,b,c,d}. Scores against H, worked out by hand:
    //   P2 = {p,b,c,d,e}: jaccard 4/5=0.8, shares rare token "d" (freq 2)
    //        for +0.25 -> capped at 1.
    //   P1 = {p,b,c,e}:   jaccard 3/4=0.75, no rare shared token -> 0.75.
    //   P5 = {p,b,c,i,j}: jaccard 3/6=0.5, no rare shared token -> 0.5.
    //   P3 = {p,b,f}:     jaccard 2/5=0.4, no rare shared token -> 0.4.
    //   P4 = {p,g,h}:     jaccard 1/6=0.1667 -> below threshold, never a candidate.
    // maxPerClaim defaults to 3, so P3 (the lowest of the 4 qualifying
    // candidates) is dropped even though it clears the threshold.
    const h = unit("h.md", 1, "H1", "p b c d");
    const p1 = unit("p1.md", 1, "H1", "p b c e");
    const p2 = unit("p2.md", 1, "H1", "p b c d e");
    const p3 = unit("p3.md", 1, "H1", "p b f");
    const p4 = unit("p4.md", 1, "H1", "p g h");
    const p5 = unit("p5.md", 1, "H1", "p b c i j");
    const pairs = buildPairs([h, p1, p2, p3, p4, p5], { minTokens: 0 });
    const partners = pairs.filter((p) => p.a === h || p.b === h).map((p) => (p.a === h ? p.b : p.a));
    assert.equal(partners.length, 3);
    assert.ok(partners.includes(p1));
    assert.ok(partners.includes(p2));
    assert.ok(partners.includes(p5));
    assert.ok(!partners.includes(p3));
    assert.ok(!partners.includes(p4));
  });

  it("produces byte-identical output across two calls on shuffled input", () => {
    const claims = [
      unit("a.md", 1, "H1", "restart the server after config change"),
      unit("b.md", 1, "H1", "restart server after config update"),
      unit("a.md", 20, "H2", "restart server after config update"),
      unit("c.md", 1, "H1", "logs show errors today"),
      unit("d.md", 1, "H1", "today is a bonus day filler"),
    ];
    const shuffled = [claims[3], claims[1], claims[4], claims[0], claims[2]];
    const first = buildPairs(claims, { minTokens: 0 });
    const second = buildPairs(shuffled, { minTokens: 0 });
    const serialize = (pairs) => pairs.map((p) => [p.score, p.a.file, p.a.startLine, p.b.file, p.b.startLine]);
    assert.deepEqual(serialize(first), serialize(second));
  });

  it("drops a claim below minTokens even on a perfect vocabulary match", () => {
    // "**Changes**:" normalizes to the single content token "changes" (1 < 6).
    // Both claims are identical text, so without the filter they would score
    // a perfect match. With the default minTokens=6 neither claim survives to
    // reach the index, so the pair can never form.
    const a = unit("a.md", 1, "H1", "**Changes**:");
    const b = unit("b.md", 1, "H1", "**Changes**:");
    assert.deepEqual(buildPairs([a, b]), []);
  });

  it("lets a caller lower minTokens to admit a shorter claim", () => {
    // "restart the server after config change" has 4 content tokens: restart,
    // server, config, change. "the" and "after" are stopwords. 4 is below the
    // default of 6. Passing minTokens: 4 admits it.
    const a = unit("a.md", 1, "H1", "restart the server after config change");
    const b = unit("b.md", 1, "H1", "restart server after config update");
    assert.deepEqual(buildPairs([a, b]), []);
    const pairs = buildPairs([a, b], { minTokens: 4 });
    assert.equal(pairs.length, 1);
  });

  it("never returns a self-pair or a duplicate unordered pair", () => {
    const claims = [
      unit("a.md", 1, "H1", "restart the server after config change"),
      unit("b.md", 1, "H1", "restart server after config update"),
      unit("c.md", 1, "H1", "restart the server after config change"),
    ];
    const pairs = buildPairs(claims, { minTokens: 0 });
    for (const pair of pairs) {
      assert.notEqual(pair.a, pair.b);
    }
    const seen = new Set();
    for (const pair of pairs) {
      const indexA = claims.indexOf(pair.a);
      const indexB = claims.indexOf(pair.b);
      const key = indexA < indexB ? `${indexA}:${indexB}` : `${indexB}:${indexA}`;
      assert.ok(!seen.has(key), `duplicate pair ${key}`);
      seen.add(key);
    }
  });
});
