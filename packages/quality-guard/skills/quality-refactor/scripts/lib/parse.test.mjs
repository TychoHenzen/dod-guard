// Rust and Go have no parentheses around if/while/for/match conditions, so a
// heuristic that reads "name(...) {" as a definition mistakes a trailing
// method call for one (`if path.exists() {` looks like a definition of
// `exists`). findFunctions routes rs/go through a keyword-anchored scan
// instead (`fn`/`func`) and every test here asserts the exact name set, so a
// phantom name fails the test rather than just adding a harmless extra.

import assert from "node:assert/strict";
import { test } from "node:test";
import { lineIndex } from "./offsets.mjs";
import { findFunctions } from "./parse.mjs";
import { strip } from "./strip.mjs";

/** Names findFunctions collects, run through the same pipeline scanFile uses. */
function namesIn(source, lang) {
  const { code } = strip(source, lang);
  const starts = lineIndex(code);
  return findFunctions(code, lang, starts)
    .map((fn) => fn.name)
    .sort();
}

test("rust: an if condition ending in a method call is not a definition", () => {
  const src = `
fn caller() {
    if path.exists() {
        do_thing();
    }
}
`;
  assert.deepEqual(namesIn(src, "rs"), ["caller"]);
});

test("rust: a while-let over a call is not a definition", () => {
  const src = `
fn caller() {
    while let Some(item) = iter.next() {
        use_item(item);
    }
}
`;
  assert.deepEqual(namesIn(src, "rs"), ["caller"]);
});

test("rust: a for over an iterator method is not a definition", () => {
  const src = `
fn caller() {
    for entry in read_dir().flatten() {
        touch(entry);
    }
}
`;
  assert.deepEqual(namesIn(src, "rs"), ["caller"]);
});

test("rust: a match on a call is not a definition", () => {
  const src = `
fn caller() {
    match parse_input() {
        Some(v) => use_value(v),
        None => {}
    }
}
`;
  assert.deepEqual(namesIn(src, "rs"), ["caller"]);
});

test("rust: a plain fn is a definition", () => {
  const src = `
fn add(a: i32, b: i32) -> i32 {
    a + b
}
`;
  assert.deepEqual(namesIn(src, "rs"), ["add"]);
});

test("rust: a pub async fn is a definition", () => {
  const src = `
pub async fn fetch(url: String) -> String {
    do_fetch(url).await
}
`;
  assert.deepEqual(namesIn(src, "rs"), ["fetch"]);
});

test("rust: an unsafe fn is a definition", () => {
  const src = `
unsafe fn raw_write(ptr: *mut u8, value: u8) {
    *ptr = value;
}
`;
  assert.deepEqual(namesIn(src, "rs"), ["raw_write"]);
});

test("rust: a method inside an impl block is a definition", () => {
  const src = `
impl Widget {
    fn resize(&self, factor: f64) {
        self.scale(factor);
    }
}
`;
  assert.deepEqual(namesIn(src, "rs"), ["resize"]);
});

test("rust: self, &self, &mut self, and mut self receivers do not count as parameters", () => {
  const src = `
fn a(self, x: i32) -> i32 {
    x
}
fn b(&self, x: i32) -> i32 {
    x
}
fn c(&mut self, x: i32) -> i32 {
    x
}
fn d(mut self, x: i32) -> i32 {
    x
}
fn e(&'a self, x: i32) -> i32 {
    x
}
`;
  const { code } = strip(src, "rs");
  const starts = lineIndex(code);
  const fns = findFunctions(code, "rs", starts);
  for (const fn of fns) {
    assert.deepEqual(fn.params, ["x: i32"], `${fn.name}() params`);
  }
});

test("rust: a closure is not collected", () => {
  const src = `
fn caller() {
    let add = |a, b| { a + b };
    add(1, 2);
}
`;
  assert.deepEqual(namesIn(src, "rs"), ["caller"]);
});

test("go: an if with an init statement is not a definition", () => {
  const src = `
func caller() {
    if v, ok := lookup(); ok {
        use(v)
    }
}
`;
  assert.deepEqual(namesIn(src, "go"), ["caller"]);
});

test("go: a range over a call is not a definition", () => {
  const src = `
func caller() {
    for _, v := range items() {
        use(v)
    }
}
`;
  assert.deepEqual(namesIn(src, "go"), ["caller"]);
});

test("go: a plain func is a definition", () => {
  const src = `
func Add(a, b int) int {
    return a + b
}
`;
  assert.deepEqual(namesIn(src, "go"), ["Add"]);
});

test("go: a method with a receiver is a definition", () => {
  const src = `
func (s *Server) Handle(w Writer) {
    s.dispatch(w)
}
`;
  assert.deepEqual(namesIn(src, "go"), ["Handle"]);
});
