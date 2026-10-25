import { test } from "node:test";
import assert from "node:assert/strict";
import { checkExpression, checkExpressionAnswers } from "../src/core/expressions.mjs";

const height = { type: "reference", reference: { objectKind: "definition", objectId: "height", capabilityId: "value", outputId: "value.final" } };

test("a well-formed jump height formula passes", () => {
  const formula = { type: "add", args: [
    { type: "multiply", args: [{ type: "literal", value: 0.5 }, height] },
    { type: "multiply", args: [{ type: "literal", value: 10 }, { type: "context", path: "variables.test.margin" }] }
  ] };
  assert.deepEqual(checkExpression(formula), []);
  assert.deepEqual(checkExpression(3), []);
});

test("what broke the assistant is caught: empty operation, reference without target", () => {
  const problems = checkExpression({ type: "add", args: [{ type: "" }, { type: "reference", reference: {} }] }, "calcul");
  assert.deepEqual(problems.map(p => [p.path, p.code]), [["calcul.args.0", "UNKNOWN_OPERATION"], ["calcul.args.1", "REFERENCE_UNSET"]]);
});

test("only formula and condition answers are checked, list rows included", () => {
  const questions = [{ id: "name", kind: "name" }, { id: "expression", kind: "formula" },
    { id: "variants", kind: "list", fields: [{ id: "when", kind: "condition" }] }];
  const problems = checkExpressionAnswers(questions, { name: "{", expression: height, variants: [{ when: { type: "gt", left: height } }] });
  assert.deepEqual(problems.map(p => p.path), ["variants.0.when.right"]);
});
