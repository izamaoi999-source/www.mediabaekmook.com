import {
  json, err, readJson, verifyPassword, isAdmin, ipHash, tooMany, logEvent, parseId, fullPost, FAIL_LIMIT,
} from "../../../../lib/board.js";

async function authorize(request, env, row, body) {
  if (await isAdmin(request, env)) return "admin";
  if (body && (await verifyPassword(body.password, row))) return "author";
  return null;
}

async function load(env, id) {
  return env.DB.prepare("SELECT * FROM posts WHERE id = ?").bind(id).first();
}

// POST /api/board/posts/:id  {password}  또는 헤더 X-Admin-Password → 글 열람
export async function onRequestPost({ request, env, params }) {
  const id = parseId(params);
  if (!id) return err("글을 찾을 수 없습니다.", 404);
  const ip = await ipHash(request, env);
  if (await tooMany(env, "fail", ip, FAIL_LIMIT)) return err("비밀번호 오류가 너무 많습니다. 10분 후 다시 시도해 주세요.", 429);
  const body = (await readJson(request)) || {};
  const row = await load(env, id);
  if (!row) return err("글을 찾을 수 없습니다.", 404);
  const role = await authorize(request, env, row, body);
  if (!role) {
    await logEvent(env, "fail", ip);
    return err("비밀번호가 올바르지 않습니다.", 403);
  }
  return json({ role, post: fullPost(row) });
}

// DELETE /api/board/posts/:id  {password} 또는 관리자 → 삭제
export async function onRequestDelete({ request, env, params }) {
  const id = parseId(params);
  if (!id) return err("글을 찾을 수 없습니다.", 404);
  const ip = await ipHash(request, env);
  if (await tooMany(env, "fail", ip, FAIL_LIMIT)) return err("비밀번호 오류가 너무 많습니다. 10분 후 다시 시도해 주세요.", 429);
  const body = (await readJson(request)) || {};
  const row = await load(env, id);
  if (!row) return err("글을 찾을 수 없습니다.", 404);
  const role = await authorize(request, env, row, body);
  if (!role) {
    await logEvent(env, "fail", ip);
    return err("비밀번호가 올바르지 않습니다.", 403);
  }
  await env.DB.prepare("DELETE FROM posts WHERE id = ?").bind(id).run();
  return json({ ok: true, role });
}
