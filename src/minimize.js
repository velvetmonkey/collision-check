// SPDX-License-Identifier: MIT
// Minimal Receipt Compiler.
//
// Given target T and candidate fields F1..Fn over a space S, find the
// SMALLEST subset whose witness map refines T over S — "what is the minimum
// evidence needed to decide this claim?" The systems version of the
// head-count / witness-number results in attention-lean.
//
// Search strategy (reported honestly in every result):
//   n <= EXHAUSTIVE_MAX fields: subsets enumerated by increasing cardinality,
//     lexicographic by field index within a cardinality; the first refining
//     subset is returned. Guaranteed minimum cardinality over S. Ties beyond
//     the first lexicographic winner are not enumerated.
//   n >  EXHAUSTIVE_MAX: greedy backward elimination from the full set.
//     Result is a sufficient set with no single-field slack, but minimum
//     cardinality is NOT guaranteed. Labelled as such.
//
// If even the FULL field set does not refine T, the claim is not decidable
// from any subset of the given fields over S (dropping fields only coarsens
// the witness map) — reported as an honest "none".

import { analyze } from "./refine.js";

export const EXHAUSTIVE_MAX = 16;

function* subsetsBySize(n) {
  // Yield index arrays: all subsets of {0..n-1} by increasing size, then
  // lexicographic. Size 0 is skipped (an empty witness map refines only
  // constant targets; callers with a constant target still get size-1 sets
  // rejected upward — handled by yielding the empty set first for honesty).
  yield [];
  for (let size = 1; size <= n; size++) {
    const idx = Array.from({ length: size }, (_, i) => i);
    while (true) {
      yield [...idx];
      let i = size - 1;
      while (i >= 0 && idx[i] === n - size + i) i--;
      if (i < 0) break;
      idx[i]++;
      for (let j = i + 1; j < size; j++) idx[j] = idx[j - 1] + 1;
    }
  }
}

export function minimize(spec) {
  const full = analyze(spec, spec.fields);
  const base = {
    regime: spec.regime,
    statesCount: spec.statesCount ?? spec.states.length,
    candidateFields: [...spec.fields],
  };
  if (!full.refines) {
    return {
      ...base,
      strategy: "n/a (full set already fails)",
      found: false,
      collision: full.collision,
      note: "the FULL candidate field set does not refine the target over this space; no subset can (dropping fields only coarsens the witness map). The claim is not decidable from these fields over this space.",
    };
  }
  const n = spec.fields.length;
  if (n <= EXHAUSTIVE_MAX) {
    for (const idx of subsetsBySize(n)) {
      const fields = idx.map((i) => spec.fields[i]);
      const r = fields.length === 0
        ? analyzeEmpty(spec)
        : analyze(spec, fields);
      if (r.refines) {
        return {
          ...base,
          strategy: `exhaustive (all 2^${n} subsets by increasing size; first refining subset returned — minimum cardinality guaranteed over this space, lexicographic tie-break)`,
          found: true,
          minimalFields: fields,
          redundantFields: spec.fields.filter((f) => !fields.includes(f)),
        };
      }
    }
    // Unreachable: full set refines, and the full set is enumerated last.
    throw new Error("internal: full set refines but enumeration found nothing");
  }
  // Greedy backward elimination.
  let fields = [...spec.fields];
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < fields.length; i++) {
      const candidate = fields.filter((_, j) => j !== i);
      const r = candidate.length === 0 ? analyzeEmpty(spec) : analyze(spec, candidate);
      if (r.refines) {
        fields = candidate;
        changed = true;
        break;
      }
    }
  }
  return {
    ...base,
    strategy: `greedy backward elimination (n=${n} > ${EXHAUSTIVE_MAX}); sufficient with no single-field slack — minimum cardinality NOT guaranteed`,
    found: true,
    minimalFields: fields,
    redundantFields: spec.fields.filter((f) => !fields.includes(f)),
  };
}

// Empty witness map: every state is in one fibre; refines iff T is constant.
function analyzeEmpty(spec) {
  const probe = { ...spec, fields: ["__empty__"], states: spec.states.map((s) => ({ fields: { __empty__: 0 }, target: s.target })) };
  return analyze(probe, ["__empty__"]);
}
