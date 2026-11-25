import { json, err, readJson, isAdmin, ipHash, tooMany, logEvent, FAIL_LIMIT } from "../../lib/board.js";
import { isStudio, readFields, publicItem } from "../../lib/equipment.js";

// GET /api/equipment?studio=bangbae|yeongeon → 공개 목록
export async function onRequestGet({ request, env }) {
  const studio = new URL(request.url).searchParams.get("studio") || "";
  if (!isStudio(studio)) return err("지점을 확인해 주세요.");
  const { results } = await env.DB.prepare(
    "SELECT * FROM equipment WHERE studio = ? ORDER BY sort_order, id"
  ).bind(studio).all();
  return json({ studio, items: results.map(publicItem) });
}

// POST /api/equipment {studio, category, name, model, qty, note} (관리자)
export async function onRequestPost({ request, env }) {
  const ip = await ipHash(request, env);
  if (await tooMany(env, "fail", ip, FAIL_LIMIT)) return err("비밀번호 오류가 너무 많습니다. 10분 후 다시 시도해 주세요.", 429);
  if (!(await isAdmin(request, env))) {
    await logEvent(env, "fail", ip);
    return err("관리자만 장비를 추가할 수 있습니다.", 403);
  }
  const body = await readJson(request);
  if (!body) return err("요청 형식이 올바르지 않습니다.");
  if (!isStudio(body.studio)) return err("지점을 확인해 주세요.");
  const r = readFields(body, false);
  if (r.error) return err(r.error);
  const f = r.fields;
  const max = await env.DB.prepare("SELECT COALESCE(MAX(sort_order), 0) AS m FROM equipment WHERE studio = ?").bind(body.studio).first();
  const now = Date.now();
  const res = await env.DB.prepare(
    "INSERT INTO equipment (studio, category, name, model, qty, note, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(body.studio, f.category, f.name, f.model, f.qty, f.note, (max?.m || 0) + 10, now, now).run();
  const row = await env.DB.prepare("SELECT * FROM equipment WHERE id = ?").bind(res.meta.last_row_id).first();
  return json({ ok: true, item: publicItem(row) }, 201);
}
