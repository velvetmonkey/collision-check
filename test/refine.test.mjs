// SPDX-License-Identifier: MIT
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyze, validateSpec } from "../src/refine.js";

const fixture = (name) => JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8"));

test("parity3: the known antipode collision, exact pair", () => {
  const r = analyze(fixture("parity3.json"));
  assert.equal(r.refines, false);
  assert.equal(r.regime, "exhaustive");
  // The Lean instance (WitnessSeparation.lean §2): all-false vs all-true,
  // colliding on the all-witnesses-false value, parity separates 0 vs 1.
  assert.equal(r.collision.first.index, 0);
  assert.equal(r.collision.second.index, 7);
  assert.deepEqual(r.collision.witnessValue, { w0: false, w1: false, w2: false });
  assert.equal(r.collision.firstTarget, false);
  assert.equal(r.collision.secondTarget, true);
});

test("seal pre-v2 field set: payload collision found", () => {
  const r = analyze(fixture("seal-approval-v0.json"));
  assert.equal(r.refines, false);
  assert.equal(r.collision.first.index, 0);
  assert.equal(r.collision.second.index, 1);
  assert.equal(r.collision.firstTarget.arguments.payload.row, "A");
  assert.equal(r.collision.secondTarget.arguments.payload.row, "B");
});

test("seal v2 field set: refines over the enumerated space", () => {
  const r = analyze(fixture("seal-approval-v2.json"));
  assert.equal(r.refines, true);
  assert.equal(r.regime, "exhaustive");
});

test("field subsets: args_hash alone fails (two tools, identical arguments)", () => {
  const spec = fixture("seal-approval-v2.json");
  const r = analyze(spec, ["args_hash"]);
  assert.equal(r.refines, false);
  assert.notEqual(r.collision.firstTarget.tool, r.collision.secondTarget.tool);
});

test("field subsets: tool + args_hash refines", () => {
  const r = analyze(fixture("seal-approval-v2.json"), ["tool", "args_hash"]);
  assert.equal(r.refines, true);
});

test("unknown field throws", () => {
  assert.throws(() => analyze(fixture("parity3.json"), ["w0", "nope"]), /unknown field/);
});

test("validateSpec rejects missing regime, empty fields, targetless states", () => {
  const errs = validateSpec({ fields: [], states: [{ fields: {} }] });
  assert.ok(errs.some((e) => e.startsWith("regime:")));
  assert.ok(errs.some((e) => e.startsWith("fields:")));
  assert.ok(errs.some((e) => e.includes("target")));
});

test("determinism: same input, identical result object", () => {
  const a = JSON.stringify(analyze(fixture("seal-approval-v0.json")));
  const b = JSON.stringify(analyze(fixture("seal-approval-v0.json")));
  assert.equal(a, b);
});
