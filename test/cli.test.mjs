// SPDX-License-Identifier: MIT
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const BIN = fileURLToPath(new URL("../bin/witness-check", import.meta.url));
const FIX = (n) => fileURLToPath(new URL(`../fixtures/${n}`, import.meta.url));

function run(args) {
  try {
    return { code: 0, out: execFileSync(process.execPath, [BIN, ...args], { encoding: "utf8" }) };
  } catch (e) {
    return { code: e.status, out: (e.stdout ?? "") + (e.stderr ?? "") };
  }
}

test("analyze parity3: exit 1, collision copy indicts the field set", () => {
  const { code, out } = run(["analyze", FIX("parity3.json")]);
  assert.equal(code, 1);
  assert.match(out, /FAIL {2}collision/);
  assert.match(out, /indicts the FIELD SET, not one implementation/);
  assert.match(out, /witness_separation_fails/);
});

test("analyze seal v2 exhaustive: exit 0, decision scoped to the space", () => {
  const { code, out } = run(["analyze", FIX("seal-approval-v2.json")]);
  assert.equal(code, 0);
  assert.match(out, /regime: EXHAUSTIVE/);
  assert.match(out, /REFINES the target over the enumerated space/);
  assert.match(out, /only that space/);
});

test("analyze sampled PASS: qualified, never an unqualified 'refines'", () => {
  const { code, out } = run(["analyze", FIX("seal-approval-v2-sampled.json")]);
  assert.equal(code, 0);
  assert.match(out, /regime: SAMPLED/);
  assert.match(out, /no collision found in the 3-state sample/);
  assert.match(out, /NOT a refinement claim/);
  assert.ok(!/ REFINES /.test(out), "sampled output must not print an unqualified REFINES");
});

test("minimize seal v2: exit 0, [tool, args_hash]", () => {
  const { code, out } = run(["minimize", FIX("seal-approval-v2.json")]);
  assert.equal(code, 0);
  assert.match(out, /MINIMAL sufficient field set over the enumerated space: \[tool, args_hash\]/);
  assert.match(out, /redundant for this target over this space: \[table, operation, session_id, expiry, nonce\]/);
});

test("minimize undecidable: exit 1, honest none", () => {
  const { code, out } = run(["minimize", FIX("undecidable.json")]);
  assert.equal(code, 1);
  assert.match(out, /NONE/);
  assert.match(out, /not decidable from these fields over this space/);
});

test("--fields subset on analyze", () => {
  const { code } = run(["analyze", FIX("seal-approval-v2.json"), "--fields", "tool,args_hash"]);
  assert.equal(code, 0);
});

test("bad spec: exit 2", () => {
  const { code } = run(["analyze", FIX("../package.json")]);
  assert.equal(code, 2);
});

test("byte determinism: two runs, identical bytes (text and --json)", () => {
  for (const args of [["analyze", FIX("seal-approval-v0.json")], ["minimize", FIX("seal-approval-v2.json"), "--json"]]) {
    const a = run(args), b = run(args);
    assert.equal(a.out, b.out);
    assert.equal(a.code, b.code);
  }
});
