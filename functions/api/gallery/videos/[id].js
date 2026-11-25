import { json, err, readJson, isAdmin, ipHash, tooMany, logEvent, parseId, clean, FAIL_LIMIT } from "../../../../lib/board.js";
import { publicVideo } from "../../../../lib/gallery.js";

async function guard(request, env) {
  const ip = await ipHash(request, env);
  if (await tooMany(env, "fail", ip, FAIL_LIMIT)) return err("비밀번호 오류가 너무 많습니다. 10분 후 다시 시도해 주세요.", 429);
  if (!(await isAdmin(request, env))) {
    await logEvent(env, "fail", ip);
    return err("관리자만 할 수 있습니다.", 403);
  }
  return null;
}

// PATCH /api/gallery/videos/:id {pinned?, title?, description?} (관리자)
export async function onRequestPatch({ request, env, params }) {
  const denied = await guard(request, env);
  if (denied) return denied;
  const id = parseId(params);
  if (!id) return err("영상을 찾을 수 없습니다.", 404);
  const body = await readJson(request);
  if (!body) return err("요청 형식이 올바르지 않습니다.");
  const row = await env.DB.prepare("SELECT * FROM videos WHERE id = ?").bind(id).first();
  if (!row) return err("영상을 찾을 수 없습니다.", 404);
  const title = body.title !== undefined ? clean(body.title, 100) || row.title : row.title;
  const description = body.description !== undefined ? clean(body.description, 300) : row.description;
  const pinned_at = body.pinned === undefined ? row.pinned_at : body.pinned ? Date.now() : null;
  await env.DB.prepare("UPDATE videos SET title = ?, description = ?, pinned_at = ? WHERE id = ?")
    .bind(title, description, pinned_at, id).run();
  return json({ ok: true, video: publicVideo({ ...row, title, description, pinned_at }) });
}

// DELETE /api/gallery/videos/:id (관리자)
export async function onRequestDelete({ request, env, params }) {
  const denied = await guard(request, env);
  if (denied) return denied;
  const id = parseId(params);
  if (!id) return err("영상을 찾을 수 없습니다.", 404);
  const res = await env.DB.prepare("DELETE FROM videos WHERE id = ?").bind(id).run();
  if (!res.meta?.changes) return err("영상을 찾을 수 없습니다.", 404);
  return json({ ok: true });
}
