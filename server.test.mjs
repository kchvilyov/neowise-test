import { test, after } from "node:test";
import assert from "node:assert/strict";

process.env.PORT = "0";
const { server } = await import("./server.mjs");
if (!server.listening) await new Promise((resolve) => server.once("listening", resolve));
const port = server.address().port;
const url = `http://127.0.0.1:${port}/api/triage`;

after(() => server.close());

async function post(body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test("пустой ввод -> 400 invalid_input", async () => {
  const res = await post({ text: "   " });
  assert.equal(res.status, 400);
  assert.equal(res.body.status, "invalid_input");
});

test("отсутствует text -> 400 invalid_input", async () => {
  const res = await post({});
  assert.equal(res.status, 400);
  assert.equal(res.body.status, "invalid_input");
});

test("корректный текст -> ready с допустимой темой и непустым черновиком", async () => {
  const res = await post({ text: "Вопрос по доставке" });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "ready");
  assert.equal(res.body.topic, "delivery");
  assert.ok(res.body.draft.trim().length > 0);
});

test("таймаут модели -> 200 manual_review", async () => {
  const res = await post({ text: "[timeout]" });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: "manual_review", topic: null, draft: null });
});

test("ошибка модели -> 200 manual_review", async () => {
  const res = await post({ text: "[error]" });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: "manual_review", topic: null, draft: null });
});

test("не-JSON ответ модели -> 200 manual_review", async () => {
  const res = await post({ text: "[bad-json]" });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: "manual_review", topic: null, draft: null });
});

test("недопустимая тема -> 200 manual_review", async () => {
  const res = await post({ text: "[bad-topic]" });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: "manual_review", topic: null, draft: null });
});

test("пустой черновик -> 200 manual_review", async () => {
  const res = await post({ text: "[empty-draft]" });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: "manual_review", topic: null, draft: null });
});