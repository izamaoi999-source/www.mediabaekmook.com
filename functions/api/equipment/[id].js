import { json, err, readJson, isAdmin, ipHash, tooMany, logEvent, parseId, FAIL_LIMIT } from "../../../lib/board.js";
import { readFields, publicItem } from "../../../lib/equipment.js";

async function guard(request, env) {
  const ip = await ipHash(request, env);
  if (await tooMany(env, "fail", ip, FAIL_LIMIT)) return err("비밀번호 오류가 너무 많습니다. 10분 후 다시 시도해 주세요.", 429);
  if (!(await isAdmin(request, env))) {
    await logEvent(env, "fail", ip);
    return err("관리자만 할 수 있습니다.", 403);
  }
  return null;
}

// PATCH /api/equipment/:id {category?, name?, model?, qty?, note?, move?: 'up'|'down'} (관리자, 지점은 변경 불가)
export async function onRequestPatch({ request, env, params }) {
  const denied = await guard(request, env);
  if (denied) return denied;
  const id = parseId(params);
  if (!id) return err("장비를 찾을 수 없습니다.", 404);
  const body = await readJson(request);
  if (!body) return err("요청 형식이 올바르지 않습니다.");
  const row = await env.DB.prepare("SELECT * FROM equipment WHERE id = ?").bind(id).first();
  if (!row) return err("장비를 찾을 수 없습니다.", 404);

  if (body.move === "up" || body.move === "down") {
    const sql = body.move === "up"
      ? "SELECT * FROM equipment WHERE studio = ? AND (sort_order < ? OR (sort_order = ? AND id < ?)) ORDER BY sort_order DESC, id DESC LIMIT 1"
      : "SELECT * FROM equipment WHERE studio = ? AND (sort_order > ? OR (sort_order = ? AND id > ?)) ORDER BY sort_order, id LIMIT 1";
    const other = await env.DB.prepare(sql).bind(row.studio, row.sort_order, row.sort_order, row.id).first();
    if (other) {
      let a = other.sort_order, b = row.sort_order;
      if (a === b) { a = body.move === "up" ? b - 1 : b + 1; }
      await env.DB.batch([
        env.DB.prepare("UPDATE equipment SET sort_order = ? WHERE id = ?").bind(a, row.id),
        env.DB.prepare("UPDATE equipment SET sort_order = ? WHERE id = ?").bind(b, other.id),
      ]);
    }
    return json({ ok: true });
  }

  const r = readFields(body, true);
  if (r.error) return err(r.error);
  const f = { ...row, ...r.fields, updated_at: Date.now() };
  await env.DB.prepare("UPDATE equipment SET category = ?, name = ?, model = ?, qty = ?, note = ?, updated_at = ? WHERE id = ?")
    .bind(f.category, f.name, f.model, f.qty, f.note, f.updated_at, id).run();
  return json({ ok: true, item: publicItem(f) });
}

// DELETE /api/equipment/:id (관리자)
export async function onRequestDelete({ request, env, params }) {
  const denied = await guard(request, env);
  if (denied) return denied;
  const id = parseId(params);
  if (!id) return err("장비를 찾을 수 없습니다.", 404);
  const res = await env.DB.prepare("DELETE FROM equipment WHERE id = ?").bind(id).run();
  if (!res.meta?.changes) return err("장비를 찾을 수 없습니다.", 404);
  return json({ ok: true });
}
