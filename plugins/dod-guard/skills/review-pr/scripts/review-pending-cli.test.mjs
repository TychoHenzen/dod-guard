import assert from "node:assert/strict";
import { readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { pendingCli } from "./review-pending-cli.test-support.mjs";

const { HEAD, pendingOf, place, run, setup } = pendingCli;
const BOTH = ["b01", "b02"];

const names = (entries) => entries.map((entry) => entry.batch);

const keep = (doc) => doc;
const wrongHead = (doc) => ({ ...doc, headSha: "f".repeat(40) });
const dropFirst = (doc) => ({ ...doc, answers: doc.answers.slice(1) });
const gone = (doc) => ({ ...doc, answers: doc.answers.map((a, i) => (i === 0 ? { ...a, path: "gone.mjs" } : a)) });
const missing = /^b01: answers file .* is missing$/;
const OUTSIDE = /^b01: Q00: .* is outside the checkout$/;
const CASES = [
  ["lists every batch when no answers exist", {}, [], BOTH, missing],
  ["lists every batch as done when all are answered", { b01: keep, b02: keep }, BOTH, [], /^$/],
  ["separates an answered batch from a missing one", { b02: keep }, ["b02"], ["b01"], missing],
  ["counts a truncated file as pending", { b01: '{"planHash": "ab' }, [], BOTH, /^b01: Cannot read JSON from /],
  ["counts a file for another head as pending", { b01: wrongHead }, [], BOTH, /^b01: headSha is/],
  ["counts a file that lacks an answer as pending", { b01: dropFirst }, [], BOTH, /^b01: missing answer for Q00$/],
  [
    "counts a file citing a missing path as pending",
    { b01: gone, b02: keep },
    ["b02"],
    ["b01"],
    /^b01: Q00: "gone\.mjs" is not a file under the checkout$/,
  ],
];

for (const [name, put, done, todo, problem] of CASES) {
  test(`pending ${name} and writes nothing`, (t) => {
    const env = setup(t);
    place(env, put);
    const out = pendingOf(env);
    assert.deepEqual([out.done, names(out.pending)], [done, todo]);
    assert.match(out.pending[0]?.problems[0] ?? "", problem);
    const written = Object.keys(put).map((batch) => `${batch}.json`);
    assert.deepEqual(readdirSync(env.answers), written);
  });
}

test("pending reads a missing directory as all pending, then sees a rewritten file as done", (t) => {
  const env = setup(t);
  assert.deepEqual(names(pendingOf(env, path.join(env.dir, "never-made")).pending), BOTH);
  place(env, { b01: "{broken" });
  assert.deepEqual(pendingOf(env).done, []);
  place(env, { b01: keep });
  const out = pendingOf(env);
  assert.deepEqual([out.done, names(out.pending)], [["b01"], ["b02"]]);
});

test("pending runs with its flags and refuses a missing flag, a short head and an extra flag", (t) => {
  const env = setup(t);
  const flags = [`--plan=${env.plan}`, `--head=${HEAD}`, `--answers-dir=${env.answers}`, `--root=${env.root}`];
  assert.equal(run("pending", flags).status, 0);
  const shortHead = [flags[0], "--head=abc", flags[2], flags[3]];
  for (const bad of [flags.slice(0, 2), flags.slice(0, 3), shortHead, [...flags, "--out=x.json"]]) {
    const result = run("pending", bad);
    assert.equal([result.status, result.stderr.startsWith("Usage:")].join(), "3,true", bad.join(" "));
  }
});

test("pending counts a batch citing the facts file as done only when --facts names it", (t) => {
  const env = setup(t);
  const facts = path.join(env.dir, "git-facts.txt");
  writeFileSync(facts, "head 0a0a\n");
  const citeFacts = ({ answers: [first, ...rest], ...doc }) => ({
    ...doc,
    answers: [{ ...first, path: facts }, ...rest],
  });
  place(env, { b01: citeFacts, b02: keep });
  assert.deepEqual(pendingOf(env, env.answers, [`--facts=${facts}`]).done, BOTH);
  const without = pendingOf(env);
  assert.deepEqual([without.done, names(without.pending)], [["b02"], ["b01"]]);
  assert.match(without.pending[0].problems[0], OUTSIDE);
});
