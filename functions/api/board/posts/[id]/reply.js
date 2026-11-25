import { json, err, readJson, isAdmin, ipHash, tooMany, logEvent, parseId, clean, FAIL_LIMIT } from "../../../../../lib/board.js";

// PUT /api/board/posts/:id/reply  {reply}  (관리자 전용, 빈 문자열이면 답변 삭제)
export async function onRequestPut({ request, env, params }) {
  const id = parseId(params);
  if (!id) return err("글을 찾을 수 없습니다.", 404);
  const ip = await ipHash(request, env);
  if (await tooMany(env, "fail", ip, FAIL_LIMIT)) return err("비밀번호 오류가 너무 많습니다. 10분 후 다시 시도해 주세요.", 429);
  if (!(await isAdmin(request, env))) {
    await logEvent(env, "fail", ip);
    return err("관리자만 답변할 수 있습니다.", 403);
  }
  const body = await readJson(request);
  if (!body) return err("요청 형식이 올바르지 않습니다.");
  const reply = clean(body.reply, 5000);
  const now = Date.now();
  const res = await env.DB.prepare("UPDATE posts SET reply = ?, replied_at = ? WHERE id = ?")
    .bind(reply || null, reply ? now : null, id).run();
  if (!res.meta?.changes) return err("글을 찾을 수 없습니다.", 404);
  return json({ ok: true, reply: reply || null, replied_at: reply ? now : null });
}
