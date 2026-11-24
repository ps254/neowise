import assert from "node:assert/strict";
import test from "node:test";
import { triageRawBody } from "./server.mjs";

const manualReview = { status: "manual_review", topic: null, draft: null };

test("timeout becomes manual review before the mock delay ends", async () => {
  const started = Date.now();
  const outcome = await triageRawBody(JSON.stringify({ text: "заказ [timeout]" }));
  const elapsed = Date.now() - started;
  assert.equal(outcome.statusCode, 200);
  assert.deepEqual(outcome.body, manualReview);
  assert.ok(elapsed < 1000, `waited ${elapsed}ms`);
});

for (const text of ["сбой [error]", "ответ [bad-json]", "тема [bad-topic]", "черновик [empty-draft]"]) {
  test(`${text} becomes manual review`, async () => {
    const outcome = await triageRawBody(JSON.stringify({ text }));
    assert.equal(outcome.statusCode, 200);
    assert.deepEqual(outcome.body, manualReview);
  });
}

test("empty, non-string, and broken JSON are invalid input", async () => {
  const cases = [
    JSON.stringify({ text: "" }),
    JSON.stringify({ text: "   " }),
    JSON.stringify({ text: 12 }),
    JSON.stringify({}),
    "not json",
  ];
  for (const raw of cases) {
    const outcome = await triageRawBody(raw);
    assert.equal(outcome.statusCode, 400);
    assert.deepEqual(outcome.body, { status: "invalid_input" });
  }
});

test("delivery text stays ready", async () => {
  const outcome = await triageRawBody(JSON.stringify({ text: "Где доставка заказа?" }));
  assert.equal(outcome.statusCode, 200);
  assert.equal(outcome.body.status, "ready");
  assert.equal(outcome.body.topic, "delivery");
  assert.equal(typeof outcome.body.draft, "string");
  assert.ok(outcome.body.draft.trim().length > 0);
});
