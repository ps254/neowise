import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classify } from "./mock-ai.mjs";

const html = await readFile(new URL("./index.html", import.meta.url));
const TOPICS = new Set(["delivery", "pricing", "other"]);
const MODEL_TIMEOUT_MS = 300;

function json(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function manualReview() {
  return { statusCode: 200, body: { status: "manual_review", topic: null, draft: null } };
}

export async function triageRawBody(raw) {
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { statusCode: 400, body: { status: "invalid_input" } };
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { statusCode: 400, body: { status: "invalid_input" } };
  }
  const { text } = payload;
  if (typeof text !== "string" || text.trim() === "") {
    return { statusCode: 400, body: { status: "invalid_input" } };
  }

  try {
    const rawModel = await classify(text, { signal: AbortSignal.timeout(MODEL_TIMEOUT_MS) });
    const parsed = JSON.parse(rawModel);
    const topic = parsed?.topic;
    const draft = parsed?.draft;
    if (!TOPICS.has(topic) || typeof draft !== "string" || draft.trim() === "") {
      return manualReview();
    }
    return { statusCode: 200, body: { status: "ready", topic, draft } };
  } catch {
    return manualReview();
  }
}

async function handleTriage(request, response) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const outcome = await triageRawBody(Buffer.concat(chunks).toString("utf8"));
  return json(response, outcome.statusCode, outcome.body);
}

const isMain = process.argv[1]
  && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);

if (isMain) {
  createServer(async (request, response) => {
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
  }).listen(Number(process.env.PORT || 3000), "127.0.0.1");
}
