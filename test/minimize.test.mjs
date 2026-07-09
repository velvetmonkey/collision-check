// SPDX-License-Identifier: MIT
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { minimize } from "../src/minimize.js";

const fixture = (name) => JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8"));

test("seal v2: minimal receipt = [tool, args_hash], rest redundant", () => {
  const r = minimize(fixture("seal-approval-v2.json"));
  assert.equal(r.found, true);
  assert.deepEqual(r.minimalFields, ["tool", "args_hash"]);
  assert.deepEqual(r.redundantFields, ["table", "operation", "session_id", "expiry", "nonce"]);
  assert.match(r.strategy, /exhaustive/);
  assert.match(r.strategy, /minimum cardinality guaranteed/);
});

test("pre-v2 field set: full set fails, honest none with collision", () => {
  const r = minimize(fixture("seal-approval-v0.json"));
  assert.equal(r.found, false);
  assert.match(r.note, /not decidable from these fields over this space/);
  assert.ok(r.collision);
});

test("undecidable: identical states, differing targets, none", () => {
  const r = minimize(fixture("undecidable.json"));
  assert.equal(r.found, false);
});

test("constant target: empty set suffices", () => {
  const spec = {
    regime: "exhaustive",
    fields: ["a", "b"],
    states: [
      { fields: { a: 1, b: 2 }, target: "same" },
      { fields: { a: 3, b: 4 }, target: "same" },
    ],
  };
  const r = minimize(spec);
  assert.equal(r.found, true);
  assert.deepEqual(r.minimalFields, []);
  assert.deepEqual(r.redundantFields, ["a", "b"]);
});

test("determinism: repeated minimize identical", () => {
  const a = JSON.stringify(minimize(fixture("seal-approval-v2.json")));
  const b = JSON.stringify(minimize(fixture("seal-approval-v2.json")));
  assert.equal(a, b);
});
