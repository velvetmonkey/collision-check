// SPDX-License-Identifier: MIT
// Canonical JSON: deterministic serialization used for witness-tuple keys and
// target-value equality. Object keys sorted lexicographically at every depth;
// arrays keep order. JSON scalars pass through JSON.stringify. This is an
// internal equality discipline, not an interchange format.

export function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(value[k])).join(",") + "}";
}

export function canonicalEqual(a, b) {
  return canonicalJson(a) === canonicalJson(b);
}
