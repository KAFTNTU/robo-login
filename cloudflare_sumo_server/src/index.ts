import { signJwt, verifyJwt, hashPassword, verifyPassword, json, corsHeaders } from "./auth-utils";

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(req.headers.get("Origin") || "*") });
    }

    if (url.pathname === "/health") return new Response("ok");

    if (url.pathname.startsWith("/auth/")) {
      return handleAuth(req, env, url);
    }

    if (url.pathname === "/ws") {
      if ((req.headers.get("Upgrade") || "").toLowerCase() !== "websocket") {
        return new Response("Expected websocket", { status: 426 });
      }
      const room = url.searchParams.get("room") || "default";
      const id = env.ROOMS.idFromName(room);
      const stub = env.ROOMS.get(id);
      return stub.fetch(req);
    }

    return new Response("Not found", { status: 404 });
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getUser(req: Request, env: Env): Promise<any | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const payload = await verifyJwt(token, env.JWT_SECRET);
  if (!payload) return null;
  return payload;
}

// ── Auth handlers ─────────────────────────────────────────────────────────────

async function handleAuth(req: Request, env: Env, url: URL): Promise<Response> {
  const origin = req.headers.get("Origin") || "*";

  // POST /auth/register
  if (url.pathname === "/auth/register" && req.method === "POST") {
    const { email, password, username } = await req.json() as any;
    if (!email || !password || !username)
      return json({ error: "Заповніть всі поля" }, 400, origin);
    if (password.length < 6)
      return json({ error: "Пароль мінімум 6 символів" }, 400, origin);

    const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
      .bind(email.toLowerCase()).first();
    if (existing) return json({ error: "Ця пошта вже зареєстрована" }, 409, origin);

    const hash = await hashPassword(password);
    const result = await env.DB.prepare(
      "INSERT INTO users (email, username, password_hash) VALUES (?, ?, ?) RETURNING id"
    ).bind(email.toLowerCase(), username, hash).first() as any;

    const token = await signJwt({ sub: result.id, email: email.toLowerCase(), username }, env.JWT_SECRET);
    return json({ token, user: { id: result.id, email, username } }, 201, origin);
  }

  // POST /auth/login
  if (url.pathname === "/auth/login" && req.method === "POST") {
    const { email, password } = await req.json() as any;
    if (!email || !password) return json({ error: "Введіть пошту та пароль" }, 400, origin);

    const user = await env.DB.prepare(
      "SELECT id, email, username, password_hash FROM users WHERE email = ?"
    ).bind(email.toLowerCase()).first() as any;

    if (!user || !user.password_hash) return json({ error: "Невірна пошта або пароль" }, 401, origin);
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) return json({ error: "Невірна пошта або пароль" }, 401, origin);

    await env.DB.prepare("UPDATE users SET last_login = unixepoch() WHERE id = ?").bind(user.id).run();
    const token = await signJwt({ sub: user.id, email: user.email, username: user.username }, env.JWT_SECRET);
    return json({ token, user: { id: user.id, email: user.email, username: user.username } }, 200, origin);
  }

  // GET /auth/google
  if (url.pathname === "/auth/google" && req.method === "GET") {
    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: `${env.APP_URL}/auth/google/callback`,
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
    });
    return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`, 302);
  }

  // GET /auth/google/callback
  if (url.pathname === "/auth/google/callback" && req.method === "GET") {
    const code = url.searchParams.get("code");
    if (!code) return json({ error: "Немає коду авторизації" }, 400, origin);

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${env.APP_URL}/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) return json({ error: "Помилка Google OAuth" }, 502, origin);
    const { access_token } = await tokenRes.json() as any;

    const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const profile = await profileRes.json() as any;

    let user = await env.DB.prepare(
      "SELECT id, email, username FROM users WHERE google_id = ? OR email = ?"
    ).bind(profile.sub, profile.email).first() as any;

    if (!user) {
      user = await env.DB.prepare(
        "INSERT INTO users (email, username, google_id, avatar_url) VALUES (?, ?, ?, ?) RETURNING id, email, username"
      ).bind(profile.email, profile.name, profile.sub, profile.picture).first() as any;
    } else if (!user.google_id) {
      await env.DB.prepare("UPDATE users SET google_id = ?, avatar_url = ? WHERE id = ?")
        .bind(profile.sub, profile.picture, user.id).run();
    }

    await env.DB.prepare("UPDATE users SET last_login = unixepoch() WHERE id = ?").bind(user.id).run();
    const jwtToken = await signJwt({ sub: user.id, email: user.email, username: user.username }, env.JWT_SECRET);
    return Response.redirect(`${env.APP_URL}/?token=${jwtToken}#auth`, 302);
  }

  // GET /auth/me
  if (url.pathname === "/auth/me" && req.method === "GET") {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return json({ error: "Не авторизовано" }, 401, origin);
    const payload = await verifyJwt(token, env.JWT_SECRET);
    if (!payload) return json({ error: "Токен недійсний" }, 401, origin);
    const user = await env.DB.prepare(
      "SELECT id, email, username, avatar_url, created_at FROM users WHERE id = ?"
    ).bind(payload.sub).first();
    if (!user) return json({ error: "Користувача не знайдено" }, 404, origin);
    return json({ user }, 200, origin);
  }

  // ── SESSION TRACKING ─────────────────────────────────────────────────────

  // POST /auth/session/start — викликається при вході на сайт
  if (url.pathname === "/auth/session/start" && req.method === "POST") {
    const user = await getUser(req, env);
    if (!user) return json({ error: "Не авторизовано" }, 401, origin);

    const result = await env.DB.prepare(
      "INSERT INTO sessions (user_id) VALUES (?) RETURNING id"
    ).bind(user.sub).first() as any;

    return json({ session_id: result.id }, 200, origin);
  }

  // POST /auth/session/heartbeat — викликається кожні 30 сек поки юзер на сайті
  if (url.pathname === "/auth/session/heartbeat" && req.method === "POST") {
    const user = await getUser(req, env);
    if (!user) return json({ ok: false }, 401, origin);
    const { session_id } = await req.json() as any;

    await env.DB.prepare(
      "UPDATE sessions SET last_heartbeat = unixepoch(), duration_seconds = unixepoch() - started_at WHERE id = ? AND user_id = ?"
    ).bind(session_id, user.sub).run();

    return json({ ok: true }, 200, origin);
  }

  // POST /auth/session/end — викликається при виході зі сторінки
  if (url.pathname === "/auth/session/end" && req.method === "POST") {
    const user = await getUser(req, env);
    if (!user) return json({ ok: false }, 401, origin);
    const { session_id } = await req.json() as any;

    await env.DB.prepare(
      "UPDATE sessions SET ended_at = unixepoch(), duration_seconds = unixepoch() - started_at WHERE id = ? AND user_id = ?"
    ).bind(session_id, user.sub).run();

    return json({ ok: true }, 200, origin);
  }

  // ── STATS ────────────────────────────────────────────────────────────────

  // GET /auth/stats — статистика (захищена паролем адміна)
  if (url.pathname === "/auth/stats" && req.method === "GET") {
    // Проста захист через query param: ?admin_key=...
    const adminKey = url.searchParams.get("admin_key");
    if (!adminKey || adminKey !== env.ADMIN_KEY) {
      return json({ error: "Доступ заборонено" }, 403, origin);
    }

    // Загальна кількість користувачів
    const totalUsers = await env.DB.prepare("SELECT COUNT(*) as count FROM users").first() as any;

    // Активні сьогодні (сесія почалась сьогодні)
    const todayActive = await env.DB.prepare(
      "SELECT COUNT(DISTINCT user_id) as count FROM sessions WHERE started_at >= unixepoch('now', 'start of day')"
    ).first() as any;

    // Активні за останні 7 днів
    const weekActive = await env.DB.prepare(
      "SELECT COUNT(DISTINCT user_id) as count FROM sessions WHERE started_at >= unixepoch() - 604800"
    ).first() as any;

    // Активні за останні 30 днів
    const monthActive = await env.DB.prepare(
      "SELECT COUNT(DISTINCT user_id) as count FROM sessions WHERE started_at >= unixepoch() - 2592000"
    ).first() as any;

    // Активних за кожен день (останні 30 днів)
    const dailyStats = await env.DB.prepare(`
      SELECT
        date(started_at, 'unixepoch') as day,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(*) as total_sessions,
        ROUND(AVG(CASE WHEN duration_seconds > 0 THEN duration_seconds ELSE NULL END)) as avg_duration_sec
      FROM sessions
      WHERE started_at >= unixepoch() - 2592000
      GROUP BY day
      ORDER BY day DESC
    `).all();

    // Топ користувачів за часом на сайті (останні 30 днів)
    const topUsers = await env.DB.prepare(`
      SELECT
        u.username,
        u.email,
        COUNT(s.id) as sessions_count,
        SUM(CASE WHEN s.duration_seconds > 0 THEN s.duration_seconds ELSE 0 END) as total_seconds,
        MAX(s.started_at) as last_visit
      FROM users u
      LEFT JOIN sessions s ON s.user_id = u.id AND s.started_at >= unixepoch() - 2592000
      GROUP BY u.id
      ORDER BY total_seconds DESC
      LIMIT 20
    `).all();

    // Нові юзери за кожен день (останні 30 днів)
    const newUsersDaily = await env.DB.prepare(`
      SELECT
        date(created_at, 'unixepoch') as day,
        COUNT(*) as new_users
      FROM users
      WHERE created_at >= unixepoch() - 2592000
      GROUP BY day
      ORDER BY day DESC
    `).all();

    return json({
      summary: {
        total_users: totalUsers?.count || 0,
        active_today: todayActive?.count || 0,
        active_week: weekActive?.count || 0,
        active_month: monthActive?.count || 0,
      },
      daily_stats: dailyStats.results,
      top_users: topUsers.results,
      new_users_daily: newUsersDaily.results,
    }, 200, origin);
  }

  return json({ error: "Not found" }, 404, origin);
}

// ── Durable Object ────────────────────────────────────────────────────────────

type PID = "p1" | "p2";
type Bot = { x:number; y:number; a:number; vx:number; vy:number; wa:number; l:number; r:number; };
type InputMsg = { t:"input"; l:number; r:number; };
function clamp(v:number,a:number,b:number){ return v<a?a:(v>b?b:v); }

export class RoomDO {
  state: DurableObjectState; env: Env;
  wsByPid: Record<PID, WebSocket | null> = { p1: null, p2: null };
  pidByWs = new Map<WebSocket, PID>();
  inputs: Record<PID, { l:number; r:number }> = { p1:{l:0,r:0}, p2:{l:0,r:0} };
  bots: Record<PID, Bot>;
  tick = 0; loopStarted = false;
  phase: "lobby"|"countdown"|"fight"|"end"; fightStartTime: number = 0;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state; this.env = env;
    this.bots = {
      p1:{x:-150,y:0,a:0,       vx:0,vy:0,wa:0,l:0,r:0},
      p2:{x: 150,y:0,a:Math.PI,vx:0,vy:0,wa:0,l:0,r:0},
    };
    this.phase = "fight";
  }

  private visibleBots(){
    return {
      p1: { x: this.bots.p1.x, y: this.bots.p1.y, a: this.bots.p1.a },
      p2: { x: this.bots.p2.x, y: this.bots.p2.y, a: this.bots.p2.a }
    };
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname !== "/ws") return new Response("ok");
    const pair = new WebSocketPair();
    const client = (pair as any)[0] as WebSocket;
    const server = (pair as any)[1] as WebSocket;
    server.accept();
    let pid: PID = "p1";
    if (this.wsByPid.p1) pid = "p2";
    this.wsByPid[pid] = server;
    this.pidByWs.set(server, pid);
    server.send(JSON.stringify({ t:"hello", pid, bots:this.visibleBots(), phase:this.phase }));
    server.addEventListener("message", (ev) => {
      try {
        const data = JSON.parse(typeof ev.data === "string" ? ev.data : "");
        const who: PID = this.pidByWs.get(server) || pid;
        if (data?.t === "input") {
          const m = data as InputMsg;
          this.inputs[who] = { l: clamp(Number(m.l)||0,-100,100), r: clamp(Number(m.r)||0,-100,100) };
        }
        if (data?.t === "restart") { this.resetBots(); }
      } catch (e) {}
    });
    server.addEventListener("close", () => {
      this.pidByWs.delete(server);
      if (this.wsByPid[pid] === server) { this.wsByPid[pid] = null; }
    });
    if (!this.loopStarted) {
      this.loopStarted = true;
      await this.state.storage.setAlarm(Date.now() + 33);
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  async alarm() {
    if (!this.wsByPid.p1 && !this.wsByPid.p2) { this.loopStarted = false; return; }
    const dt = 1/30; this.tick++;
    for (const pid of ["p1","p2"] as const) { const b=this.bots[pid]; const i=this.inputs[pid]; b.l=i.l; b.r=i.r; }
    this.stepBot(this.bots.p1, dt); this.stepBot(this.bots.p2, dt); this.resolveCollision();
    let winner: PID|null = null;
    const R = 400-22;
    if (Math.hypot(this.bots.p1.x, this.bots.p1.y) > R) winner = "p2";
    else if (Math.hypot(this.bots.p2.x, this.bots.p2.y) > R) winner = "p1";
    if (winner) { this.resetBots(); }
    if (this.tick % 3 === 0) {
      this.broadcast(JSON.stringify({ t:"state", bots:this.visibleBots(), phase:"fight", winner, msLeft:0 }));
    }
    await this.state.storage.setAlarm(Date.now() + 33);
  }

  resetBots(){
    this.bots.p1={x:-150,y:0,a:0,vx:0,vy:0,wa:0,l:0,r:0};
    this.bots.p2={x:150,y:0,a:Math.PI,vx:0,vy:0,wa:0,l:0,r:0};
    this.inputs.p1={l:0,r:0}; this.inputs.p2={l:0,r:0};
  }
  broadcast(msg:string){
    if(this.wsByPid.p1) this.wsByPid.p1.send(msg);
    if(this.wsByPid.p2) this.wsByPid.p2.send(msg);
  }
  stepBot(b:Bot, dt:number){
    const maxSpeed=240; const wheelBase=60;
    const vL=(b.l/100)*maxSpeed; const vR=(b.r/100)*maxSpeed;
    const v=(vL+vR)*0.5; const w=(vR-vL)/wheelBase;
    b.vx=Math.cos(b.a)*v; b.vy=Math.sin(b.a)*v; b.wa=w;
    b.x+=b.vx*dt; b.y+=b.vy*dt; b.a+=b.wa*dt;
  }
  resolveCollision(){
    const b1=this.bots.p1, b2=this.bots.p2;
    const dx=b2.x-b1.x, dy=b2.y-b1.y;
    const d=Math.hypot(dx,dy)||0.001;
    if(d<44){ const push=(44-d)*0.5; const nx=dx/d, ny=dy/d;
      b1.x-=nx*push; b1.y-=ny*push; b2.x+=nx*push; b2.y+=ny*push; }
  }
}

export interface Env {
  ROOMS: DurableObjectNamespace;
  DB: D1Database;
  JWT_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  APP_URL: string;
  ADMIN_KEY: string;
}
