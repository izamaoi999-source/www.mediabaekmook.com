import { json } from "../../lib/board.js";

// 총 방문자 수 (D1 counters). 브라우저 세션당 한 번 POST(증가), 이후는 GET(조회) — js/main.js
const NAME = "site-visits";

export async function onRequestGet({ env }) {
  const row = await env.DB.prepare("SELECT value FROM counters WHERE name = ?").bind(NAME).first();
  return json({ value: row ? row.value : 0 });
}

export async function onRequestPost({ env }) {
  const row = await env.DB.prepare(
    "INSERT INTO counters (name, value) VALUES (?, 1) ON CONFLICT(name) DO UPDATE SET value = value + 1 RETURNING value"
  ).bind(NAME).first();
  return json({ value: row.value });
}
