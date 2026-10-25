import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const manifest = read("module.json");

test("the manifest declares no dependency on Rule Them'All", () => {
  assert.equal(manifest.relationships?.requires?.length ?? 0, 0);
  assert.ok(!JSON.stringify(manifest).includes("\"requires\""));
});

test("the download URL matches the version", () => {
  assert.ok(manifest.download.endsWith(`/v${manifest.version}/module.zip`));
});

const flatten = (obj, prefix = "") => Object.entries(obj).flatMap(([k, v]) =>
  typeof v === "object" ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`]);

test("French and English have the same keys", () => {
  assert.deepEqual(flatten(read("lang/fr.json")).sort(), flatten(read("lang/en.json")).sort());
});
