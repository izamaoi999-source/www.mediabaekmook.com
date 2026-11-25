import {
  json, err, readJson, clean, hashPassword, maskName, ipHash, tooMany, logEvent,
  PAGE_SIZE, POST_LIMIT, STUDIOS,
} from "../../../lib/board.js";

// GET /api/board/posts?page=1 → 목록 (내용·연락처 제외)
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  let page = parseInt(url.searchParams.get("page") || "1", 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  const totalRow = await env.DB.prepare("SELECT COUNT(*) AS n FROM posts").first();
  const total = totalRow?.n || 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > pages) page = pages;
  const offset = (page - 1) * PAGE_SIZE;
  const { results } = await env.DB.prepare(
    "SELECT id, name, title, studio, created_at, replied_at FROM posts ORDER BY id DESC LIMIT ? OFFSET ?"
  ).bind(PAGE_SIZE, offset).all();
  const posts = results.map((r, i) => ({
    id: r.id,
    no: total - offset - i,
    title: r.title,
    name: maskName(r.name),
    studioLabel: STUDIOS[r.studio] || "",
    created_at: r.created_at,
    replied: !!r.replied_at,
  }));
  return json({ posts, total, page, pages, pageSize: PAGE_SIZE });
}

// POST /api/board/posts → 글쓰기
export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body) return err("요청 형식이 올바르지 않습니다.");

  // 허니팟: 사람에게는 보이지 않는 칸. 채워져 있으면 성공처럼 응답하고 저장하지 않음.
  if (typeof body.website === "string" && body.website.trim() !== "") return json({ ok: true, id: 0 }, 201);

  const name = clean(body.name, 30);
  const contact = clean(body.contact, 100);
  const studio = Object.prototype.hasOwnProperty.call(STUDIOS, body.studio) ? body.studio : "";
  const desired_date = clean(body.desired_date, 10);
  const title = clean(body.title, 100);
  const content = clean(body.content, 5000);
  const password = typeof body.password === "string" ? body.password : "";

  if (!name) return err("이름을 입력해 주세요.");
  if (!studio) return err("스튜디오를 선택해 주세요.");
  if (desired_date && !/^\d{4}-\d{2}-\d{2}$/.test(desired_date)) return err("희망 날짜 형식이 올바르지 않습니다.");
  if (!title) return err("제목을 입력해 주세요.");
  if (!content) return err("내용을 입력해 주세요.");
  if (password.length < 4 || password.length > 64) return err("비밀번호는 4자 이상 64자 이하로 입력해 주세요.");
  if (body.consent !== true) return err("개인정보 수집·이용에 동의해 주세요.");

  const ip = await ipHash(request, env);
  if (await tooMany(env, "post", ip, POST_LIMIT)) return err("짧은 시간에 글을 너무 많이 썼습니다. 10분 후 다시 시도해 주세요.", 429);

  const pw = await hashPassword(password);
  const now = Date.now();
  const res = await env.DB.prepare(
    `INSERT INTO posts (name, contact, studio, desired_date, title, content, pw_hash, pw_salt, pw_iter, ip_hash, consent_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(name, contact, studio, desired_date, title, content, pw.pw_hash, pw.pw_salt, pw.pw_iter, ip, now, now).run();
  await logEvent(env, "post", ip);
  return json({ ok: true, id: res.meta?.last_row_id || null }, 201);
}
