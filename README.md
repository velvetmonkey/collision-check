# collision-check

[![ci](https://github.com/velvetmonkey/collision-check/actions/workflows/ci.yml/badge.svg)](https://github.com/velvetmonkey/collision-check/actions/workflows/ci.yml)

**One question: do these observations carry enough information to justify this claim?**

`collision-check` decides, over a finite space of states you enumerate (or sample), whether a set of
observable fields — a *witness map* — carries enough information to determine a target claim. If it
does not, it hands you the proof: a concrete **collision pair** — two states that agree on every
witness field while the claim disagrees.

```
collision-check analyze  spec.json            # PASS, or FAIL + collision pair
collision-check minimize spec.json            # smallest sufficient field subset, or an honest "none"
```

## Part of the Seal family

collision-check is the **sufficiency analyzer** beneath the Seal assurance tools. Where `seal verify`
checks that a decision receipt is well-formed, canonical, and untampered, collision-check answers the
prior question: does the receipt's *field set* carry enough to justify the claim it makes? A receipt
can be perfectly valid and still commit too little to identify what it authorizes — that gap is a
collision, and this tool finds it.

It has already earned its keep on the family (see the worked example below): it showed Seal's pre-v2
approval surface insufficient to authorize its own effect — over the enumerated fixture space,
per this tool's own honest-scope rule below — and that receipt-schema-v2's
`args_hash` is the field that closes the gap over that space.

One question each across the receipt toolset:

| question | tool |
|---|---|
| Is this receipt well-formed, canonical, and re-derivable? | `seal verify` (seal-assurance-kit) |
| Does the field set carry **enough** to justify the claim? | `collision-check` — this tool |
| What changed between two receipts — does it touch what is **authorized**? | `seal receipt-diff` (seal-assurance-kit) |
| Gate receipts in CI | `seal-verify-action` — runs `seal verify` in GitHub Actions and fails the build on an unverifiable receipt (the sufficiency and diff checks are local tools today) |

Family repositories: `seal` (umbrella: claims matrix, architecture map), `seal-host`,
`seal-check`, `seal-assurance-kit`, `seal-live-demo`, `seal-verify-action`. This tool is
private and proprietary; most of the family is private pending the public flip.

## Why a collision is stronger than a fuzzer finding

A fuzzer finding says: *this implementation* has a bug. A collision says: **the field set itself is
insufficient** — *no* implementation, however careful, can decide this claim from these fields,
because two states it must treat differently are indistinguishable through them. Fixing the code
cannot help; only changing what is observed can.

That guarantee is not folklore. It is the machine-checked content of two theorems in
[attention-lean](https://github.com/velvetmonkey/attention-lean):

- **`witness_separation_fails`** (`AttentionLean/WitnessSeparation.lean`) — if every witness takes
  the same value at `s` and `s'` while the target separates them, then **no aggregator** over the
  witness values computes the target.
- **`witness_computable_iff_refines`** (`AttentionLean/WitnessTheory.lean`) — some aggregator
  computes the target **iff** the witness map *refines* it (the target is constant on witness
  fibres). The kernel above is its one-pair contrapositive.

Both are proved in Lean 4 on the baseline axioms (`propext`, `Classical.choice`, `Quot.sound`; no
`native_decide`). **The proofs live there, not here** — this tool cites the theorems and implements
the finite decision they license: over an enumerated space, grouping states by witness projection
and checking target constancy per fibre *is* a decision of refinement over that space.

## The two commands

### `analyze` — Witness Refinement Analyzer

Input: a spec (below) with target values `T(s)` and witness fields `W1..Wk` over states `S`.

- **PASS** — the witness map refines `T` over `S`: `W(s) = W(s')` implies `T(s) = T(s')` for all
  enumerated pairs. By the characterization theorem, `T` is decidable from these fields over `S`.
- **FAIL** — a concrete collision pair `s, s'`: shared witness value, differing targets. Exit 1.
  The schema-bypass finder.

### `minimize` — Minimal Receipt Compiler

Given `T` and candidate fields `F1..Fn`, find the **smallest subset** whose witness map refines `T`
over `S` — "what is the minimum evidence needed to decide (or replay) this claim?" The systems
version of attention-lean's head-count / witness-number results.

Search strategy is printed in every result:

- `n ≤ 16` fields: **exhaustive** — all subsets by increasing cardinality, lexicographic tie-break;
  minimum cardinality **guaranteed** over `S`.
- `n > 16`: **greedy backward elimination** — sufficient with no single-field slack; minimum
  cardinality **not** guaranteed. Labelled as such.

If the *full* field set already fails, no subset can succeed (dropping fields only coarsens the
witness map): the claim is **not decidable from these fields** over this space. Reported honestly,
with the collision.

## Honest scope — read this before trusting a PASS

Every result states its **regime**, declared by the spec author:

| regime | PASS means | never means |
|---|---|---|
| `exhaustive` | a **decision**: the witness map refines the target over the enumerated space — and only that space | anything about states outside the enumeration |
| `sampled` | **no collision found in the sample** | refinement. A collision may exist outside the sample |

Further non-claims, on purpose:

- A PASS is "sufficient field set for this claim over this space" — **not** "correct", **not**
  "secure", **not** "proven" beyond what was enumerated.
- Authorization ≠ intent: fields sufficient to identify an effect say nothing about whether the
  effect *should* happen.
- The target values `T(s)` are the spec author's inputs. collision-check decides whether the fields
  determine them; it does not audit whether they are the right claim.

## Spec format

```json
{
  "name": "human label",
  "regime": "exhaustive",
  "fields": ["tool", "table", "operation", "session_id", "expiry", "nonce", "args_hash"],
  "states": [
    { "fields": { "tool": "db.execute", "...": "..." }, "target": { "any": "json value" } }
  ]
}
```

`target` is the precomputed value of `T` at each state — any JSON value (`Bool` is the special
case; the theorems are generic in the target codomain). Output is deterministic: same input, same
bytes.

## Worked example: the Seal approval schema

`fixtures/seal-approval-v0.json` models the pre-v2 [seal](https://github.com/velvetmonkey/seal)
approval surface: the grant commits `[tool, table, operation]` plus session/expiry/nonce context,
and the target asks for the **exact request-effect** (payload included). Result:

```
FAIL  collision — the field set is INSUFFICIENT for this target over this space.
      shared witness value : db.execute / staging_deploy_audit / insert / sess-01 / …
      T(s)  = … payload {"row":"A"}
      T(s') = … payload {"row":"B"}
```

No gateway reading only those six fields can uniquely authorize an exact effect — the payload is
not committed by any of them. `fixtures/seal-approval-v2.json` adds receipt-schema-v2's
`args_hash` (sha256 over the canonical arguments; values computed, not fabricated): **PASS**
(exhaustive), and `minimize` returns the minimal receipt

```
MINIMAL sufficient field set over the enumerated space: [tool, args_hash]
redundant for this target over this space: [table, operation, session_id, expiry, nonce]
```

— matching Seal's pinned convention `capabilityTarget(tool, parts) = stableHashParts([tool, ...parts])`:
the tool name is load-bearing (two servers can receive byte-identical arguments), and the arguments
hash covers the rest. Note the qualifier: session/expiry/nonce are redundant **for effect
identity**; replay-freshness is a *different target* and would need them.

`fixtures/parity3.json` is the toy fixture with a known collision, reconstructed verbatim from
`WitnessSeparation.lean` §2: three basis-point indicator witnesses over the 3-cube collide on the
all-true/all-false antipode pair while parity separates them.

## Install / run / test

```
node bin/collision-check analyze fixtures/seal-approval-v0.json
npm test        # node --test, no dependencies, Node ≥ 18
```

Exit codes: `analyze` 0 = no collision, 1 = collision, 2 = bad input. `minimize` 0 = subset found,
1 = none, 2 = bad input.

## License

Proprietary. Copyright (c) 2026 velvetmonkey. All rights reserved. See LICENSE. Part of the private
Seal family. The cited theorems remain in the public [attention-lean](https://github.com/velvetmonkey/attention-lean)
(MIT), which this repository references and never modifies.
