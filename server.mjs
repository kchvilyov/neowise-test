import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { classify } from "./mock-ai.mjs";

const html = await readFile(new URL("./index.html", import.meta.url));

function json(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

const ALLOWED_TOPICS = new Set(["delivery", "pricing", "other"]);
const MODEL_TIMEOUT_MS = 300;

function manualReview(response) {
  return json(response, 200, { status: "manual_review", topic: null, draft: null });
}

async function handleTriage(request, response) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);

  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return json(response, 400, { status: "invalid_input" });
  }

  const text = body?.text;
  if (typeof text !== "string" || text.trim() === "") {
    return json(response, 400, { status: "invalid_input" });
  }

  let raw;
  try {
    raw = await classify(text, { signal: AbortSignal.timeout(MODEL_TIMEOUT_MS) });
  } catch {
    // таймаут или ошибка провайдера
    return manualReview(response);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // модель вернула не JSON
    return manualReview(response);
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    !ALLOWED_TOPICS.has(parsed.topic) ||
    typeof parsed.draft !== "string" ||
    parsed.draft.trim() === ""
  ) {
    // неподходящая тема или пустой/пробельный черновик
    return manualReview(response);
  }

  return json(response, 200, {
    status: "ready",
    topic: parsed.topic,
    draft: parsed.draft,
  });
}

const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(html);
    return;
  }
  if (request.method !== "POST" || request.url !== "/api/triage") {
    return json(response, 404, { status: "not_found" });
  }
  try {
    await handleTriage(request, response);
  } catch {
    json(response, 500, { status: "server_error" });
  }
});

server.listen(Number(process.env.PORT || 3000), "127.0.0.1");

export { server };