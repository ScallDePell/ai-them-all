import { test } from "node:test";
import assert from "node:assert/strict";
import { negotiateIntegration } from "../src/core/rta-negotiation.mjs";

test("without Rule Them'All the module stays standalone", () => {
  assert.deepEqual(negotiateIntegration(undefined), { mode: "standalone", reason: "absent" });
});

test("a compatible 1.x API integrates", () => {
  const result = negotiateIntegration({ apiVersion: "1.1.0", capabilities: ["cardHost"] }, ["cardHost"]);
  assert.equal(result.mode, "integrated");
});

test("another major version stays standalone", () => {
  const result = negotiateIntegration({ apiVersion: "2.0.0", capabilities: [] });
  assert.equal(result.mode, "standalone");
  assert.equal(result.reason, "apiVersion");
});

test("a missing capability stays standalone and names it", () => {
  const result = negotiateIntegration({ apiVersion: "1.0.0", capabilities: ["cardHost"] }, ["cardHost", "fieldTargets"]);
  assert.equal(result.reason, "capabilities");
  assert.deepEqual(result.missing, ["fieldTargets"]);
});

test("a malformed API stays standalone", () => {
  assert.equal(negotiateIntegration({ capabilities: "all" }).mode, "standalone");
});
