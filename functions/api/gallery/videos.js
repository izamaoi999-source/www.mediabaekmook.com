import { json, err, readJson, clean, isAdmin, ipHash, tooMany, logEvent, FAIL_LIMIT } from "../../../lib/board.js";
import { parseVideoUrl, fetchOembed, publicVideo } from "../../../lib/gallery.js";

const MAX_LIMIT = 24;

// GET /api/gallery/videos?page=1&limit=12 → 공개 목록 (고정 영상 먼저, 최신순)
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  let limit = parseInt(url.searchParams.get("limit") || "12", 10);
  if (!Number.isFinite(limit) || limit < 1) limit = 12;
  limit = Math.min(limit, MAX_LIMIT);
  let page = parseInt(url.searchParams.get("page") || "1", 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  const total = (await env.DB.prepare("SELECT COUNT(*) AS n FROM videos").first())?.n || 0;
  const pages = Math.max(1, Math.ceil(total / limit));
  const { results } = await env.DB.prepare(
    "SELECT * FROM videos ORDER BY (pinned_at IS NULL), pinned_at DESC, id DESC LIMIT ? OFFSET ?"
  ).bind(limit, (page - 1) * limit).all();
  return json({ videos: results.map(publicVideo), total, page, pages, limit });
}

// POST /api/gallery/videos {url, title?, description?} (관리자)
export async function onRequestPost({ request, env }) {
  const ip = await ipHash(request, env);
  if (await tooMany(env, "fail", ip, FAIL_LIMIT)) return err("비밀번호 오류가 너무 많습니다. 10분 후 다시 시도해 주세요.", 429);
  if (!(await isAdmin(request, env))) {
    await logEvent(env, "fail", ip);
    return err("관리자만 영상을 추가할 수 있습니다.", 403);
  }
  const body = await readJson(request);
  if (!body) return err("요청 형식이 올바르지 않습니다.");
  const v = parseVideoUrl(body.url);
  if (!v) return err("유튜브 또는 Vimeo 영상 주소를 확인해 주세요.");
  let title = clean(body.title, 100);
  const description = clean(body.description, 300);

  const dup = await env.DB.prepare("SELECT id FROM videos WHERE provider = ? AND video_id = ?").bind(v.provider, v.id).first();
  if (dup) return err("이미 등록된 영상입니다.", 409);

  const meta = await fetchOembed(v);
  if (meta.status === "unavailable") return err("비공개이거나 퍼가기가 허용되지 않은 영상입니다. 영상 공개 설정을 확인해 주세요.", 422);
  if (!title) title = clean(meta.title || "", 100);
  if (!title) return err("영상 제목을 불러오지 못했습니다. 제목을 직접 입력해 주세요.", 422);

  const now = Date.now();
  const res = await env.DB.prepare(
    "INSERT INTO videos (provider, video_id, hash, title, description, thumb_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(v.provider, v.id, v.hash, title, description, meta.thumb || "", now).run();
  const row = await env.DB.prepare("SELECT * FROM videos WHERE id = ?").bind(res.meta.last_row_id).first();
  return json({ ok: true, video: publicVideo(row) }, 201);
}
