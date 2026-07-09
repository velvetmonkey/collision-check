// SPDX-License-Identifier: MIT
// Witness Refinement Analyzer.
//
// The primitive: do these observations carry enough information to justify
// this claim? A witness map W = (W1..Wk) REFINES a target T over a state
// space S when W(s) = W(s') implies T(s) = T(s') for all s, s' in S.
//
// Grounding (attention-lean, reference-only — proofs live there, not here):
//   witness_computable_iff_refines (AttentionLean/WitnessTheory.lean):
//     some aggregator computes T from the witness values IFF W refines T.
//   witness_separation_fails (AttentionLean/WitnessSeparation.lean):
//     one collision pair (W(s) = W(s'), T(s) != T(s')) means NO aggregator
//     over the witness values computes T.
//
// Consequence used here: over a finite ENUMERATED space, grouping states by
// their witness projection and checking T is constant on each fibre is a
// DECISION of refinement over that space. A collision therefore indicts the
// FIELD SET — any implementation reading only these fields admits it — not
// one implementation's bug. Over a SAMPLED space the same check only ever
// shows "no collision found in the sample"; it is never a refinement claim.

import { canonicalJson } from "./canonical.js";

export const REGIMES = ["exhaustive", "sampled"];

// Validate a spec object. Returns a list of error strings (empty = valid).
export function validateSpec(spec) {
  const errors = [];
  if (typeof spec !== "object" || spec === null || Array.isArray(spec)) {
    return ["spec: JSON object required"];
  }
  if (!REGIMES.includes(spec.regime)) {
    errors.push(`regime: must be one of ${REGIMES.join(" | ")} (the spec author declares the space's coverage; the tool cannot infer it)`);
  }
  if (!Array.isArray(spec.fields) || spec.fields.length === 0 ||
      spec.fields.some((f) => typeof f !== "string")) {
    errors.push("fields: non-empty array of field-name strings required");
  } else if (new Set(spec.fields).size !== spec.fields.length) {
    errors.push("fields: duplicate field names");
  }
  if (!Array.isArray(spec.states) || spec.states.length === 0) {
    errors.push("states: non-empty array required");
  } else {
    spec.states.forEach((s, i) => {
      if (typeof s !== "object" || s === null || Array.isArray(s)) {
        errors.push(`states[${i}]: object required`);
        return;
      }
      if (typeof s.fields !== "object" || s.fields === null || Array.isArray(s.fields)) {
        errors.push(`states[${i}].fields: object required`);
      }
      if (!("target" in s)) errors.push(`states[${i}].target: required (precomputed value of T at this state)`);
    });
  }
  return errors;
}

// Core decision. spec: validated spec; fields: subset of spec.fields to use
// as the witness map (defaults to all). Deterministic: states scanned in
// input order; the reported collision is the first (by scan order) state
// pair whose fibre already holds a state with a differing target.
//
// Returns:
//   { refines: true,  regime, statesCount, fibres }
//   { refines: false, regime, statesCount, fibres, collision:
//       { witnessValue, first: {index, state}, second: {index, state},
//         firstTarget, secondTarget } }
export function analyze(spec, fields = spec.fields) {
  for (const f of fields) {
    if (!spec.fields.includes(f)) throw new Error(`unknown field: ${f}`);
  }
  const groups = new Map(); // canonical witness tuple -> {index, targetKey}
  let fibres = 0;
  for (let i = 0; i < spec.states.length; i++) {
    const state = spec.states[i];
    const key = canonicalJson(fields.map((f) => state.fields[f] === undefined ? null : state.fields[f]));
    const targetKey = canonicalJson(state.target);
    const seen = groups.get(key);
    if (seen === undefined) {
      groups.set(key, { index: i, targetKey });
      fibres++;
      continue;
    }
    if (seen.targetKey !== targetKey) {
      const first = spec.states[seen.index];
      return {
        refines: false,
        regime: spec.regime,
        statesCount: spec.states.length,
        fibres,
        fields: [...fields],
        collision: {
          witnessValue: Object.fromEntries(fields.map((f) => [f, first.fields[f] === undefined ? null : first.fields[f]])),
          first: { index: seen.index, state: first },
          second: { index: i, state },
          firstTarget: first.target,
          secondTarget: state.target,
        },
      };
    }
  }
  return { refines: true, regime: spec.regime, statesCount: spec.states.length, fibres, fields: [...fields] };
}
