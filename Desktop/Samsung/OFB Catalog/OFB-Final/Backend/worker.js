// OFB Catalog — Cloudflare Worker
// D1 Database backend

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Telegram-Init-Data, X-Admin-Password, X-Device-ID",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function err(message, status = 400) {
  return json({ error: message }, status);
}

// ─── Telegram Login Widget auth verification ─────────────────────────────────

async function verifyWidgetAuth(data, botToken) {
  if (!data || !data.hash || !data.auth_date) return false;
  // Must not be older than 7 days
  if (Date.now() / 1000 - Number(data.auth_date) > 604800) return false;

  const { hash, ...fields } = data;
  const dataCheckString = Object.keys(fields)
    .filter(k => fields[k] != null && fields[k] !== '')
    .sort()
    .map(k => `${k}=${fields[k]}`)
    .join('\n');

  const encoder = new TextEncoder();
  // secret_key = SHA256(bot_token)
  const secretBytes = await crypto.subtle.digest('SHA-256', encoder.encode(botToken));
  const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(dataCheckString));
  const computed = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');

  return computed === hash;
}

// POST /api/auth/telegram — verify widget auth data and create user
async function authWithTelegram(request, env) {
  const data = await request.json().catch(() => null);
  if (!data) return err("Invalid data");

  const valid = await verifyWidgetAuth(data, env.BOT_TOKEN);
  if (!valid) return err("Invalid Telegram auth data", 401);

  const tgUser = {
    id: String(data.id),
    first_name: data.first_name || '',
    last_name: data.last_name || '',
    username: data.username || '',
    photo_url: data.photo_url || ''
  };
  await ensureUser(env, tgUser);

  return json({ ok: true, user: tgUser });
}

// ─── Telegram user from init data ───────────────────────────────────────────

async function parseTelegramUser(request, env) {
  const initData = request.headers.get("X-Telegram-Init-Data");
  if (initData) {
    try {
      const params = new URLSearchParams(initData);
      const userStr = params.get("user");
      if (userStr) return JSON.parse(decodeURIComponent(userStr));
    } catch {}
  }

  // Telegram Login Widget auth (browser users)
  const widgetAuthHeader = request.headers.get("X-Telegram-Widget-Auth");
  if (widgetAuthHeader) {
    try {
      const authData = JSON.parse(widgetAuthHeader);
      const valid = await verifyWidgetAuth(authData, env.BOT_TOKEN);
      if (valid) {
        return {
          id: String(authData.id),
          first_name: authData.first_name || 'User',
          last_name: authData.last_name || '',
          username: authData.username || '',
          photo_url: authData.photo_url || ''
        };
      }
    } catch {}
  }

  // Device ID fallback (only for development/testing — real users must use Telegram auth)
  const deviceId = request.headers.get("X-Device-ID");
  if (deviceId) {
    return { id: deviceId, first_name: "User", username: "", is_device: true };
  }
  return null;
}

// Upsert user and return telegram_id string
async function ensureUser(env, tgUser) {
  if (!tgUser?.id) return null;
  const telegramId = String(tgUser.id);
  const existing = await env.DB.prepare(
    "SELECT telegram_id, listing_limit FROM users WHERE telegram_id = ?"
  ).bind(telegramId).first();

  if (!existing) {
    await env.DB.prepare(
      "INSERT INTO users (telegram_id, username, first_name, last_name, photo_url, last_seen_at, visit_count) VALUES (?, ?, ?, ?, ?, datetime('now'), 1)"
    ).bind(
      telegramId,
      tgUser.username || null,
      tgUser.first_name || null,
      tgUser.last_name || null,
      tgUser.photo_url || null
    ).run();
    return { telegram_id: telegramId, listing_limit: 1 };
  }
  // Update last seen + visit counter (fire-and-forget)
  env.DB.prepare(
    "UPDATE users SET last_seen_at = datetime('now'), visit_count = COALESCE(visit_count, 0) + 1 WHERE telegram_id = ?"
  ).bind(telegramId).run();
  return existing;
}

// ─── LISTINGS ────────────────────────────────────────────────────────────────

// GET /api/listings?category=&search=
async function getListings(request, env) {
  const url = new URL(request.url);
  const category = url.searchParams.get("category");
  const search = url.searchParams.get("search");

  let query = "SELECT * FROM listings WHERE status = 'approved' AND is_premium = 0";
  const params = [];

  if (category && category !== "all") {
    query += " AND category = ?";
    params.push(category);
  }
  if (search) {
    query += " AND (name LIKE ? OR description LIKE ?)";
    params.push(`%${search}%`, `%${search}%`);
  }
  query += " ORDER BY created_at DESC";

  const result = await env.DB.prepare(query).bind(...params).all();
  return json({ data: result.results });
}

// GET /api/listings/premium
async function getPremiumListings(request, env) {
  const url = new URL(request.url);
  const category = url.searchParams.get('category');
  let query = "SELECT * FROM listings WHERE status = 'approved' AND is_premium = 1";
  const params = [];
  if (category && category !== 'all') {
    query += " AND category = ?";
    params.push(category);
  }
  query += " ORDER BY created_at DESC";
  const result = await env.DB.prepare(query).bind(...params).all();
  return json({ data: result.results });
}

// GET /api/listings/:id
async function getListing(env, id) {
  const listing = await env.DB.prepare(
    "SELECT * FROM listings WHERE id = ?"
  ).bind(id).first();
  if (!listing) return err("Not found", 404);
  await env.DB.prepare("UPDATE listings SET views = views + 1 WHERE id = ?").bind(id).run();
  return json(listing);
}

// POST /api/listings
async function createListing(request, env) {
  const tgUser = await parseTelegramUser(request, env);
  const user = await ensureUser(env, tgUser);

  if (!user) return err("Telegram auth required", 401);

  // Count existing listings for this user
  const existing = await env.DB.prepare(
    "SELECT COUNT(*) as count FROM listings WHERE user_telegram_id = ? AND status != 'rejected'"
  ).bind(user.telegram_id).first();

  if (existing.count >= user.listing_limit) {
    return err(`Вы уже разместили максимальное количество заявок (${user.listing_limit}). Для увеличения лимита обратитесь к администратору.`, 403);
  }

  const body = await request.json();
  const { name, description, category, telegram, avatar } = body;

  if (!name || !description || !category || !telegram) {
    return err("Заполните все обязательные поля");
  }

  const result = await env.DB.prepare(
    "INSERT INTO listings (user_telegram_id, name, description, category, telegram, avatar, status) VALUES (?, ?, ?, ?, ?, ?, 'approved')"
  ).bind(user.telegram_id, name, description, category, telegram.replace("@", ""), avatar || "").run();

  const newId = result.meta.last_row_id;

  // Notify category subscribers (fire-and-forget)
  const cleanTelegram = telegram.replace("@", "");
  const subs = await env.DB.prepare(
    "SELECT user_telegram_id FROM subscriptions WHERE category = ?"
  ).bind(category).all().catch(() => ({ results: [] }));

  const token = env.BOT_TOKEN;
  const webappUrl = env.WEBAPP_URL || "https://catalog-b8u.pages.dev";
  const catLabels = { models: "Модели", management: "Менеджмент", marketing: "Маркетинг", chatters: "Чаттеры", photographers: "Фотографы", videographers: "Видеографы", smm: "SMM", designers: "Дизайнеры", other: "Другое" };
  const catLabel = catLabels[category] || category;

  for (const sub of subs.results) {
    if (sub.user_telegram_id === user.telegram_id) continue;
    fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: sub.user_telegram_id,
        text: `🔔 Новое объявление в категории <b>${catLabel}</b>!\n\n<b>${name}</b>\n${description.slice(0, 120)}...\n\n📎 @${cleanTelegram}`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[ { text: "📋 Открыть каталог", web_app: { url: webappUrl } } ]] }
      })
    }).catch(() => {});
  }

  return json({ success: true, id: newId }, 201);
}

// ─── JOBS ────────────────────────────────────────────────────────────────────

// GET /api/jobs?category=
async function getJobs(request, env) {
  const url = new URL(request.url);
  const category = url.searchParams.get("category");
  const search = url.searchParams.get("search");

  let query = "SELECT * FROM jobs WHERE status = 'approved'";
  const params = [];

  if (category && category !== "all") {
    query += " AND category = ?";
    params.push(category);
  }
  if (search) {
    query += " AND (name LIKE ? OR description LIKE ?)";
    params.push(`%${search}%`, `%${search}%`);
  }
  query += " ORDER BY created_at DESC";

  const result = await env.DB.prepare(query).bind(...params).all();
  return json({ data: result.results });
}

// POST /api/jobs
async function createJob(request, env) {
  const tgUser = await parseTelegramUser(request, env);
  const user = await ensureUser(env, tgUser);

  if (!user) return err("Telegram auth required", 401);

  // Check job limit (same listing_limit applies)
  const existing = await env.DB.prepare(
    "SELECT COUNT(*) as count FROM jobs WHERE user_telegram_id = ? AND status != 'rejected'"
  ).bind(user.telegram_id).first();

  if (existing.count >= user.listing_limit) {
    return err(`Вы уже разместили максимальное количество заявок (${user.listing_limit}). Для увеличения лимита обратитесь к администратору.`, 403);
  }

  const body = await request.json();
  const { name, description, category, telegram } = body;

  if (!name || !description || !category || !telegram) {
    return err("Заполните все обязательные поля");
  }

  const result = await env.DB.prepare(
    "INSERT INTO jobs (user_telegram_id, name, description, category, telegram, status) VALUES (?, ?, ?, ?, ?, 'approved')"
  ).bind(user.telegram_id, name, description, category, telegram.replace("@", "")).run();

  return json({ success: true, id: result.meta.last_row_id }, 201);
}

// DELETE /api/listings/:id  (owner only)
async function deleteListing(request, env, id) {
  const tgUser = await parseTelegramUser(request, env);
  const user = await ensureUser(env, tgUser);
  if (!user) return err("Telegram auth required", 401);

  const listing = await env.DB.prepare(
    "SELECT user_telegram_id FROM listings WHERE id = ?"
  ).bind(id).first();
  if (!listing) return err("Not found", 404);
  if (listing.user_telegram_id !== user.telegram_id) return err("Forbidden", 403);

  await env.DB.prepare("DELETE FROM listings WHERE id = ?").bind(id).run();
  return json({ success: true });
}

// DELETE /api/jobs/:id  (owner only)
async function deleteJob(request, env, id) {
  const tgUser = await parseTelegramUser(request, env);
  const user = await ensureUser(env, tgUser);
  if (!user) return err("Telegram auth required", 401);

  const job = await env.DB.prepare(
    "SELECT user_telegram_id FROM jobs WHERE id = ?"
  ).bind(id).first();
  if (!job) return err("Not found", 404);
  if (job.user_telegram_id !== user.telegram_id) return err("Forbidden", 403);

  await env.DB.prepare("DELETE FROM jobs WHERE id = ?").bind(id).run();
  return json({ success: true });
}

// ─── RATINGS ─────────────────────────────────────────────────────────────────

// GET /api/listings/:id/ratings
async function getRatings(env, listingId) {
  const result = await env.DB.prepare(
    "SELECT r.*, u.first_name as user_name, u.username FROM ratings r LEFT JOIN users u ON r.user_telegram_id = u.telegram_id WHERE r.listing_id = ? ORDER BY r.created_at DESC"
  ).bind(listingId).all();
  return json({ data: result.results });
}

// POST /api/listings/:id/ratings
async function createRating(request, env, listingId) {
  const tgUser = await parseTelegramUser(request, env);
  const user = await ensureUser(env, tgUser);
  if (!user) return err("Telegram auth required", 401);

  const { rating, comment } = await request.json();
  if (!rating || rating < 1 || rating > 5) return err("Рейтинг должен быть от 1 до 5");

  // Cannot rate own listing
  const listing = await env.DB.prepare("SELECT user_telegram_id FROM listings WHERE id = ?").bind(listingId).first();
  if (listing && listing.user_telegram_id === user.telegram_id) {
    return err("Нельзя оценивать собственное объявление");
  }

  try {
    await env.DB.prepare(
      "INSERT INTO ratings (listing_id, user_telegram_id, rating, comment) VALUES (?, ?, ?, ?)"
    ).bind(listingId, user.telegram_id, rating, comment || null).run();
  } catch {
    return err("Вы уже оставили отзыв для этой заявки");
  }

  // Update avg_rating and reviews_count
  const avg = await env.DB.prepare(
    "SELECT AVG(rating) as avg, COUNT(*) as cnt FROM ratings WHERE listing_id = ?"
  ).bind(listingId).first();

  await env.DB.prepare(
    "UPDATE listings SET avg_rating = ?, reviews_count = ? WHERE id = ?"
  ).bind(Math.round(avg.avg * 10) / 10, avg.cnt, listingId).run();

  return json({ success: true }, 201);
}

// ─── COMPLAINTS ───────────────────────────────────────────────────────────────

// POST /api/listings/:id/complaints
async function createComplaint(request, env, listingId) {
  const tgUser = await parseTelegramUser(request, env);
  const user = await ensureUser(env, tgUser);
  if (!user) return err("Telegram auth required", 401);

  const { reason, details } = await request.json();
  if (!reason) return err("Укажите причину");

  await env.DB.prepare(
    "INSERT INTO complaints (listing_id, user_telegram_id, reason, details) VALUES (?, ?, ?, ?)"
  ).bind(listingId, user.telegram_id, reason, details || null).run();

  // Auto-mark as scam after 3 complaints
  const count = await env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM complaints WHERE listing_id = ? AND reason = 'scam'"
  ).bind(listingId).first();

  if (count.cnt >= 3) {
    await env.DB.prepare(
      "UPDATE listings SET is_scam = 1 WHERE id = ?"
    ).bind(listingId).run();
  }

  return json({ success: true }, 201);
}

// ─── FAVORITES ────────────────────────────────────────────────────────────────

// GET /api/favorites
async function getFavorites(request, env) {
  const tgUser = await parseTelegramUser(request, env);
  const user = await ensureUser(env, tgUser);
  if (!user) return json({ data: [] });

  const result = await env.DB.prepare(
    "SELECT l.* FROM listings l JOIN favorites f ON l.id = f.listing_id WHERE f.user_telegram_id = ? AND l.status = 'approved' ORDER BY f.created_at DESC"
  ).bind(user.telegram_id).all();
  return json({ data: result.results });
}

// POST /api/favorites/:id
async function toggleFavorite(request, env, listingId) {
  const tgUser = await parseTelegramUser(request, env);
  const user = await ensureUser(env, tgUser);
  if (!user) return err("Telegram auth required", 401);

  const existing = await env.DB.prepare(
    "SELECT id FROM favorites WHERE user_telegram_id = ? AND listing_id = ?"
  ).bind(user.telegram_id, listingId).first();

  if (existing) {
    await env.DB.prepare(
      "DELETE FROM favorites WHERE user_telegram_id = ? AND listing_id = ?"
    ).bind(user.telegram_id, listingId).run();
    return json({ action: "removed" });
  }

  await env.DB.prepare(
    "INSERT INTO favorites (user_telegram_id, listing_id) VALUES (?, ?)"
  ).bind(user.telegram_id, listingId).run();
  return json({ action: "added" });
}

// GET /api/favorites/check/:id
async function checkFavorite(request, env, listingId) {
  const tgUser = await parseTelegramUser(request, env);
  const user = await ensureUser(env, tgUser);
  if (!user) return json({ isFavorite: false });

  const existing = await env.DB.prepare(
    "SELECT id FROM favorites WHERE user_telegram_id = ? AND listing_id = ?"
  ).bind(user.telegram_id, listingId).first();
  return json({ isFavorite: !!existing });
}

// ─── PROFILE ─────────────────────────────────────────────────────────────────

// GET /api/profile
async function getProfile(request, env) {
  const tgUser = await parseTelegramUser(request, env);
  const user = await ensureUser(env, tgUser);
  if (!user) return err("Telegram auth required", 401);

  const profile = await env.DB.prepare(
    "SELECT * FROM users WHERE telegram_id = ?"
  ).bind(user.telegram_id).first();
  return json(profile);
}

// PUT /api/profile
async function updateProfile(request, env) {
  const tgUser = await parseTelegramUser(request, env);
  const user = await ensureUser(env, tgUser);
  if (!user) return err("Telegram auth required", 401);

  const body = await request.json().catch(() => ({}));
  // Frontend sends: { name, telegram, description, avatar }
  const firstName = body.name || body.first_name || null;
  const telegram = body.telegram || body.username || null;
  const description = body.description || null;
  const avatar = body.avatar || null;

  await env.DB.prepare(
    "UPDATE users SET first_name = COALESCE(?, first_name), telegram = COALESCE(?, telegram), description = COALESCE(?, description), avatar = COALESCE(?, avatar) WHERE telegram_id = ?"
  ).bind(firstName, telegram, description, avatar, user.telegram_id).run();

  return json({ success: true });
}

// GET /api/profile/listings
async function getMyListings(request, env) {
  const tgUser = await parseTelegramUser(request, env);
  const user = await ensureUser(env, tgUser);
  if (!user) return json({ data: [] });

  const listings = await env.DB.prepare(
    "SELECT * FROM listings WHERE user_telegram_id = ? ORDER BY created_at DESC"
  ).bind(user.telegram_id).all();

  const jobs = await env.DB.prepare(
    "SELECT * FROM jobs WHERE user_telegram_id = ? ORDER BY created_at DESC"
  ).bind(user.telegram_id).all();

  return json({ listings: listings.results, jobs: jobs.results });
}

// ─── NOTIFICATIONS (stub — returns empty, real push via Telegram Bot) ─────────

async function getNotifications(request, env) {
  return json({ data: [], unread_count: 0 });
}

async function markNotificationsRead(request, env) {
  return json({ success: true });
}

// ─── SUBSCRIPTIONS ────────────────────────────────────────────────────────────

async function getSubscriptions(request, env) {
  const tgUser = await parseTelegramUser(request, env);
  const user = await ensureUser(env, tgUser);
  if (!user) return json({ data: [] });

  const result = await env.DB.prepare(
    "SELECT category FROM subscriptions WHERE user_telegram_id = ?"
  ).bind(user.telegram_id).all();

  return json({ data: result.results.map(r => r.category) });
}

async function toggleSubscription(request, env, category) {
  const tgUser = await parseTelegramUser(request, env);
  const user = await ensureUser(env, tgUser);
  if (!user) return err("Telegram auth required", 401);

  const existing = await env.DB.prepare(
    "SELECT id FROM subscriptions WHERE user_telegram_id = ? AND category = ?"
  ).bind(user.telegram_id, category).first();

  if (existing) {
    await env.DB.prepare(
      "DELETE FROM subscriptions WHERE user_telegram_id = ? AND category = ?"
    ).bind(user.telegram_id, category).run();
    return json({ action: "unsubscribed" });
  }

  await env.DB.prepare(
    "INSERT OR IGNORE INTO subscriptions (user_telegram_id, category) VALUES (?, ?)"
  ).bind(user.telegram_id, category).run();
  return json({ action: "subscribed" });
}

// ─── OPEN TO WORK ─────────────────────────────────────────────────────────────

// POST /api/listings/:id/available — owner toggles is_available
async function toggleAvailable(request, env, id) {
  const tgUser = await parseTelegramUser(request, env);
  const user = await ensureUser(env, tgUser);
  if (!user) return err("Telegram auth required", 401);

  const listing = await env.DB.prepare(
    "SELECT is_available, user_telegram_id FROM listings WHERE id = ?"
  ).bind(id).first();
  if (!listing) return err("Not found", 404);
  if (listing.user_telegram_id !== user.telegram_id) return err("Forbidden", 403);

  const newVal = listing.is_available ? 0 : 1;
  await env.DB.prepare("UPDATE listings SET is_available = ? WHERE id = ?").bind(newVal, id).run();
  return json({ is_available: newVal });
}

// ─── UPLOAD ───────────────────────────────────────────────────────────────────

// POST /api/upload — returns placeholder (real upload needs R2 or external service)
async function handleUpload(request, env) {
  // If R2 bucket is configured — use it, otherwise return placeholder
  if (env.MEDIA_BUCKET) {
    try {
      const formData = await request.formData();
      const file = formData.get("image");
      if (!file) return err("No file provided");

      const ext = file.name?.split(".").pop() || "jpg";
      const filename = `avatars/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

      await env.MEDIA_BUCKET.put(filename, file.stream(), {
        httpMetadata: { contentType: file.type },
      });

      const baseUrl = env.MEDIA_BASE_URL || "https://media.ofbcatalog.com";
      return json({ url: `${baseUrl}/${filename}` });
    } catch (e) {
      return err("Upload failed: " + e.message, 500);
    }
  }

  // Fallback: no storage configured
  return json({ url: "" });
}

// ─── ADMIN ────────────────────────────────────────────────────────────────────

const ADMIN_PASSWORD = "ofb_admin_2026"; // Change this!

function checkAdminAuth(request) {
  const auth = request.headers.get("X-Admin-Password");
  return auth === ADMIN_PASSWORD;
}

// GET /api/admin/stats
async function adminStats(request, env) {
  if (!checkAdminAuth(request)) return err("Forbidden", 403);

  const users = await env.DB.prepare("SELECT COUNT(*) as c FROM users").first();
  const listings = await env.DB.prepare("SELECT COUNT(*) as c FROM listings WHERE status = 'approved'").first();
  const pending = await env.DB.prepare("SELECT COUNT(*) as c FROM listings WHERE status = 'pending'").first();
  const pendingJobs = await env.DB.prepare("SELECT COUNT(*) as c FROM jobs WHERE status = 'pending'").first();
  const premium = await env.DB.prepare("SELECT COUNT(*) as c FROM listings WHERE is_premium = 1").first();
  const complaints = await env.DB.prepare("SELECT COUNT(*) as c FROM complaints WHERE status = 'pending'").first();
  const scam = await env.DB.prepare("SELECT COUNT(*) as c FROM listings WHERE is_scam = 1").first();

  // Visit stats: unique users (by last_seen_at) and total visits (sum visit_count)
  const activeWeek = await env.DB.prepare(
    "SELECT COUNT(*) as c FROM users WHERE last_seen_at >= datetime('now', '-7 days')"
  ).first();
  const activeMonth = await env.DB.prepare(
    "SELECT COUNT(*) as c FROM users WHERE last_seen_at >= datetime('now', '-30 days')"
  ).first();
  const newWeek = await env.DB.prepare(
    "SELECT COUNT(*) as c FROM users WHERE created_at >= datetime('now', '-7 days')"
  ).first();
  const newMonth = await env.DB.prepare(
    "SELECT COUNT(*) as c FROM users WHERE created_at >= datetime('now', '-30 days')"
  ).first();
  const totalVisitsWeek = await env.DB.prepare(
    "SELECT COALESCE(SUM(visit_count), 0) as c FROM users WHERE last_seen_at >= datetime('now', '-7 days')"
  ).first();
  const totalVisitsMonth = await env.DB.prepare(
    "SELECT COALESCE(SUM(visit_count), 0) as c FROM users WHERE last_seen_at >= datetime('now', '-30 days')"
  ).first();

  return json({
    users: users.c,
    listings: listings.c,
    pending: pending.c + pendingJobs.c,
    premium: premium.c,
    complaints: complaints.c,
    scam: scam.c,
    visits: {
      unique_week: activeWeek.c,
      unique_month: activeMonth.c,
      new_week: newWeek.c,
      new_month: newMonth.c,
      total_week: totalVisitsWeek.c,
      total_month: totalVisitsMonth.c,
    }
  });
}

// GET /api/admin/listings/pending
async function adminPendingListings(request, env) {
  if (!checkAdminAuth(request)) return err("Forbidden", 403);

  const listings = await env.DB.prepare(
    "SELECT * FROM listings WHERE status = 'pending' ORDER BY created_at DESC"
  ).all();
  const jobs = await env.DB.prepare(
    "SELECT * FROM jobs WHERE status = 'pending' ORDER BY created_at DESC"
  ).all();

  return json({ data: [...listings.results.map(l => ({...l, type: 'listing'})), ...jobs.results.map(j => ({...j, type: 'job'}))] });
}

// GET /api/admin/listings/all
async function adminAllListings(request, env) {
  if (!checkAdminAuth(request)) return err("Forbidden", 403);

  const result = await env.DB.prepare(
    "SELECT * FROM listings ORDER BY is_premium DESC, created_at DESC"
  ).all();
  return json({ data: result.results });
}

// POST /api/admin/listings/:id/approve
async function adminApproveListing(request, env, id) {
  if (!checkAdminAuth(request)) return err("Forbidden", 403);
  await env.DB.prepare("UPDATE listings SET status = 'approved', updated_at = datetime('now') WHERE id = ?").bind(id).run();
  return json({ success: true });
}

// POST /api/admin/listings/:id/reject
async function adminRejectListing(request, env, id) {
  if (!checkAdminAuth(request)) return err("Forbidden", 403);
  await env.DB.prepare("UPDATE listings SET status = 'rejected', updated_at = datetime('now') WHERE id = ?").bind(id).run();
  return json({ success: true });
}

// POST /api/admin/listings/:id/scam
async function adminToggleScam(request, env, id) {
  if (!checkAdminAuth(request)) return err("Forbidden", 403);
  const listing = await env.DB.prepare("SELECT is_scam FROM listings WHERE id = ?").bind(id).first();
  if (!listing) return err("Not found", 404);
  await env.DB.prepare("UPDATE listings SET is_scam = ? WHERE id = ?").bind(listing.is_scam ? 0 : 1, id).run();
  return json({ success: true });
}

// POST /api/admin/listings/:id/premium
async function adminTogglePremium(request, env, id) {
  if (!checkAdminAuth(request)) return err("Forbidden", 403);
  const body = await request.json().catch(() => ({}));

  // If body.enable explicitly provided — use it; otherwise toggle current state
  let newState;
  if (body.enable !== undefined) {
    newState = body.enable ? 1 : 0;
  } else {
    const current = await env.DB.prepare(
      "SELECT is_premium FROM listings WHERE id = ?"
    ).bind(id).first();
    newState = current ? (current.is_premium ? 0 : 1) : 1;
  }

  if (newState === 1) {
    await env.DB.prepare(
      "UPDATE listings SET is_premium = 1, updated_at = datetime('now') WHERE id = ?"
    ).bind(id).run();
  } else {
    await env.DB.prepare(
      "UPDATE listings SET is_premium = 0, premium_until = NULL, updated_at = datetime('now') WHERE id = ?"
    ).bind(id).run();
  }
  return json({ success: true, is_premium: newState });
}

// GET /api/admin/complaints
async function adminComplaints(request, env) {
  if (!checkAdminAuth(request)) return err("Forbidden", 403);
  const result = await env.DB.prepare(
    "SELECT c.*, l.name as listing_name FROM complaints c LEFT JOIN listings l ON c.listing_id = l.id ORDER BY c.created_at DESC"
  ).all();
  return json({ data: result.results });
}

// POST /api/admin/complaints/:id/resolve
async function adminResolveComplaint(request, env, id) {
  if (!checkAdminAuth(request)) return err("Forbidden", 403);
  await env.DB.prepare("UPDATE complaints SET status = 'resolved' WHERE id = ?").bind(id).run();
  return json({ success: true });
}

// GET /api/admin/users
async function adminUsers(request, env) {
  if (!checkAdminAuth(request)) return err("Forbidden", 403);
  const result = await env.DB.prepare(
    "SELECT u.*, (SELECT COUNT(*) FROM listings WHERE user_telegram_id = u.telegram_id) as listings_count FROM users u ORDER BY u.created_at DESC"
  ).all();
  return json({ data: result.results });
}

// POST /api/admin/users/:id/verify
async function adminVerifyUser(request, env, telegramId) {
  if (!checkAdminAuth(request)) return err("Forbidden", 403);
  await env.DB.prepare("UPDATE users SET is_verified = 1 WHERE telegram_id = ?").bind(telegramId).run();
  // Also verify all approved listings of this user
  await env.DB.prepare("UPDATE listings SET is_verified = 1 WHERE user_telegram_id = ? AND status = 'approved'").bind(telegramId).run();
  return json({ success: true });
}

// POST /api/admin/users/:id/limit
async function adminSetLimit(request, env, telegramId) {
  if (!checkAdminAuth(request)) return err("Forbidden", 403);
  const body = await request.json();
  if (!body.limit || body.limit < 1) return err("Invalid limit");
  await env.DB.prepare("UPDATE users SET listing_limit = ? WHERE telegram_id = ?").bind(body.limit, telegramId).run();
  return json({ success: true });
}

// POST /api/admin/jobs/:id/approve
async function adminApproveJob(request, env, id) {
  if (!checkAdminAuth(request)) return err("Forbidden", 403);
  await env.DB.prepare("UPDATE jobs SET status = 'approved' WHERE id = ?").bind(id).run();
  return json({ success: true });
}

// POST /api/admin/jobs/:id/reject
async function adminRejectJob(request, env, id) {
  if (!checkAdminAuth(request)) return err("Forbidden", 403);
  await env.DB.prepare("UPDATE jobs SET status = 'rejected' WHERE id = ?").bind(id).run();
  return json({ success: true });
}

// GET /api/admin/notifications
async function adminGetNotifications(request, env) {
  if (!checkAdminAuth(request)) return err("Forbidden", 403);
  try {
    const result = await env.DB.prepare(
      "SELECT * FROM notifications ORDER BY created_at DESC LIMIT 100"
    ).all();
    return json({ data: result.results });
  } catch {
    return json({ data: [] });
  }
}

// POST /api/admin/notifications — broadcast to all users via Telegram bot
async function adminSendNotification(request, env) {
  if (!checkAdminAuth(request)) return err("Forbidden", 403);
  const body = await request.json().catch(() => ({}));
  const { title, body: text } = body;
  if (!title || !text) return err("title and body required");

  // Get all users with telegram_id
  const users = await env.DB.prepare("SELECT telegram_id FROM users").all();
  const token = env.BOT_TOKEN;
  let sent = 0, failed = 0;

  const message = `\uD83D\uDD14 ${title}\n\n${text}\n\n\uD83D\uDCCB OFB Catalog`;

  for (const user of users.results) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: user.telegram_id,
          text: message,
          reply_markup: {
            inline_keyboard: [[
              { text: "📋 Открыть каталог", web_app: { url: env.WEBAPP_URL || "https://catalog-b8u.pages.dev" } }
            ]]
          }
        })
      });
      const r = await res.json();
      if (r.ok) sent++; else failed++;
    } catch { failed++; }
  }

  return json({ success: true, sent, failed });
}

// ─── SETTINGS ────────────────────────────────────────────────────────────────

async function adminGetSettings(request, env) {
  if (!checkAdminAuth(request)) return err("Forbidden", 403);
  const result = await env.DB.prepare("SELECT key, value FROM settings").all();
  const obj = {};
  for (const r of result.results) obj[r.key] = r.value;
  return json(obj);
}

async function adminUpdateSettings(request, env) {
  if (!checkAdminAuth(request)) return err("Forbidden", 403);
  const body = await request.json().catch(() => ({}));
  for (const [k, v] of Object.entries(body)) {
    await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
      .bind(k, String(v)).run();
  }
  return json({ success: true });
}

// POST /api/admin/setup-menu-button — set bot menu button to open Mini App
async function adminSetupMenuButton(request, env) {
  if (!checkAdminAuth(request)) return err("Forbidden", 403);
  const webappUrl = env.WEBAPP_URL || "https://catalog-b8u.pages.dev";
  const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/setChatMenuButton`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      menu_button: { type: "web_app", text: "📋 Каталог", web_app: { url: webappUrl } }
    })
  });
  const data = await r.json();
  return json({ ...data, webapp_url: webappUrl });
}

async function adminSetupWebhook(request, env) {
  if (!checkAdminAuth(request)) return err("Forbidden", 403);
  const webhookUrl = "https://ofb-catalog-api.8cctq5y6ty.workers.dev/webhook";
  const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/setWebhook`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: webhookUrl, allowed_updates: ["message", "chat_member"] })
  });
  const data = await r.json();
  return json({ ...data, url: webhookUrl });
}

// ─── WEBHOOK (Telegram → Worker) ──────────────────────────────────────────────

const DEFAULT_WELCOME_TEXT = `👋 <b>{name}</b>, добро пожаловать в <b>OFB | OnlyFans Board</b>!\n\n📌 Здесь ты можешь:\n✅ Размещать объявления — модели, агентства, чаттеры\n✅ Находить специалистов — фотографы, видеографы, SMM, менеджеры\n✅ Публиковать резюме в разделе «Ищу работу»\n\n⚠️ <b>Только тематика OnlyFans.</b> Реклама не по теме = бан.\n\n🆓 Размещение бесплатное\n⭐ Премиум — карточка в ТОПе 3 месяца\n\n👉 Открывай каталог и размещай заявку прямо сейчас!`;

function isSimilar(a, b) {
  const words = s => new Set(s.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const wa = words(a), wb = words(b);
  if (wa.size === 0 || wb.size === 0) return false;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / Math.min(wa.size, wb.size) >= 0.65;
}

async function handleWebhook(request, env) {
  const update = await request.json().catch(() => null);
  if (!update) return json({ ok: true });

  const token = env.BOT_TOKEN;
  const webappUrl = env.WEBAPP_URL || "https://catalog-b8u.pages.dev";

  // ── New member joined (message.new_chat_members OR chat_member update) ───
  let newMembers = update.message?.new_chat_members;
  let joinChatId = update.message?.chat?.id;

  // Also handle chat_member update type (works in supergroups when bot is admin)
  if (!newMembers && update.chat_member?.new_chat_member?.status === 'member') {
    newMembers = [update.chat_member.new_chat_member.user];
    joinChatId = update.chat_member.chat.id;
  }

  if (newMembers?.length) {
    const enabledRow = await env.DB.prepare("SELECT value FROM settings WHERE key='welcome_enabled'").first().catch(() => null);
    if (enabledRow?.value === '1') {
      const textRow = await env.DB.prepare("SELECT value FROM settings WHERE key='welcome_text'").first().catch(() => null);
      const templateText = (textRow?.value?.trim()) ? textRow.value : DEFAULT_WELCOME_TEXT;

      for (const member of newMembers) {
        if (member.is_bot) continue;
        const name = [member.first_name, member.last_name].filter(Boolean).join(" ") || "участник";
        const username = member.username ? `@${member.username}` : name;
        const text = templateText.replace(/\{name\}/g, name).replace(/\{username\}/g, username);
        try {
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: joinChatId, text, parse_mode: "HTML",
              reply_markup: { inline_keyboard: [[{ text: "📋 Открыть каталог", url: webappUrl }]] }
            })
          });
        } catch {}
      }
    }
    return json({ ok: true });
  }

  // ── /start command — send Mini App button directly ───────────────────────
  const msg = update.message;
  if (msg?.text?.startsWith('/start') && msg.chat?.type === 'private') {
    const name = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || 'Привет';
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: msg.from.id,
        text: `👋 <b>${name}</b>, добро пожаловать в <b>OFB Catalog</b>!\n\n🔥 Биржа услуг OnlyFans:\n✅ Размещай объявления бесплатно\n✅ Находи моделей, менеджеров, чаттеров\n✅ Публикуй резюме в разделе «Ищу работу»\n\n👇 Нажми кнопку ниже, чтобы открыть каталог:`,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: '📋 Открыть каталог', web_app: { url: webappUrl } }]]
        }
      })
    }).catch(() => {});

    // Ensure user is saved in DB
    await ensureUser(env, {
      id: String(msg.from.id),
      first_name: msg.from.first_name || '',
      last_name: msg.from.last_name || '',
      username: msg.from.username || '',
      photo_url: ''
    });
    return json({ ok: true });
  }

  // ── Anti-duplicate: check group messages ─────────────────────────────────
  if (msg?.text && msg.chat?.id < 0 && msg.text.length > 40) {
    const userId = String(msg.from?.id || '');
    if (userId) {
      const msgText = msg.text.slice(0, 300);
      const userRec = await env.DB.prepare(
        "SELECT last_group_msg, last_group_msg_at FROM users WHERE telegram_id = ?"
      ).bind(userId).first().catch(() => null);

      if (userRec?.last_group_msg && userRec.last_group_msg_at) {
        const hoursSince = (Date.now() - new Date(userRec.last_group_msg_at).getTime()) / 3600000;
        if (hoursSince < 24 && isSimilar(msgText, userRec.last_group_msg)) {
          try {
            await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chat_id: msg.chat.id, message_id: msg.message_id })
            });
            const displayName = msg.from.username ? `@${msg.from.username}` : msg.from.first_name;
            await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: msg.chat.id,
                text: `⚠️ ${displayName}, дублированная реклама удалена. Следующий пост доступен через 24 часа.`
              })
            });
          } catch {}
          return json({ ok: true });
        }
      }

      // Update last message (fire-and-forget)
      env.DB.prepare(
        "UPDATE users SET last_group_msg = ?, last_group_msg_at = datetime('now') WHERE telegram_id = ?"
      ).bind(msgText, userId).run().catch(() => {});
    }
  }

  return json({ ok: true });
}

// ─── SCHEDULED POSTS ─────────────────────────────────────────────────────────

// GET /api/admin/posts
async function adminGetPosts(request, env) {
  if (!checkAdminAuth(request)) return err("Forbidden", 403);
  const result = await env.DB.prepare(
    "SELECT * FROM scheduled_posts ORDER BY created_at DESC LIMIT 100"
  ).all();
  return json({ data: result.results });
}

// POST /api/admin/posts — create scheduled or draft post
async function adminCreatePost(request, env) {
  if (!checkAdminAuth(request)) return err("Forbidden", 403);
  const body = await request.json().catch(() => ({}));
  const { text, button_text, button_url, mention_all, dm_users, silent, scheduled_at, repeat_days, repeat_time, campaign_end } = body;
  if (!text) return err("text required");

  const result = await env.DB.prepare(
    "INSERT INTO scheduled_posts (text, button_text, button_url, mention_all, dm_users, silent, scheduled_at, status, repeat_days, repeat_time, campaign_end) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    text, button_text || '', button_url || '',
    mention_all ? 1 : 0, dm_users ? 1 : 0, silent ? 1 : 0,
    scheduled_at || null,
    scheduled_at ? 'pending' : 'draft',
    repeat_days || null,
    repeat_time || null,
    campaign_end || null
  ).run();

  return json({ success: true, id: result.meta.last_row_id }, 201);
}

// POST /api/admin/posts/:id/send — send immediately
async function adminSendPost(request, env, id) {
  if (!checkAdminAuth(request)) return err("Forbidden", 403);
  const post = await env.DB.prepare("SELECT * FROM scheduled_posts WHERE id = ?").bind(id).first();
  if (!post) return err("Not found", 404);
  if (post.status === 'sent') return err("Already sent");

  const result = await sendScheduledPost(env, post);
  if (!result.ok) return err("Telegram error: " + result.error, 500);

  await env.DB.prepare(
    "UPDATE scheduled_posts SET status='sent', sent_at=datetime('now'), message_id=? WHERE id=?"
  ).bind(result.message_id, id).run();

  return json({ success: true, message_id: result.message_id });
}

// POST /api/admin/posts/:id/pin — pin message
async function adminPinPost(request, env, id) {
  if (!checkAdminAuth(request)) return err("Forbidden", 403);
  const post = await env.DB.prepare("SELECT * FROM scheduled_posts WHERE id = ?").bind(id).first();
  if (!post || !post.message_id) return err("Post not sent yet");

  const chatId = env.CHAT_ID || "-1002079877078";
  const token = env.BOT_TOKEN;

  const r = await fetch(`https://api.telegram.org/bot${token}/pinChatMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: post.message_id, disable_notification: false })
  });
  const data = await r.json();
  if (!data.ok) return err("Pin failed: " + data.description, 500);

  await env.DB.prepare("UPDATE scheduled_posts SET is_pinned=1 WHERE id=?").bind(id).run();
  return json({ success: true });
}

// POST /api/admin/posts/:id/unpin — unpin, keep stats
async function adminUnpinPost(request, env, id) {
  if (!checkAdminAuth(request)) return err("Forbidden", 403);
  const post = await env.DB.prepare("SELECT * FROM scheduled_posts WHERE id = ?").bind(id).first();
  if (!post || !post.message_id) return err("Post not sent yet");

  const chatId = env.CHAT_ID || "-1002079877078";
  const token = env.BOT_TOKEN;

  const r = await fetch(`https://api.telegram.org/bot${token}/unpinChatMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: post.message_id })
  });
  const data = await r.json();
  if (!data.ok) return err("Unpin failed: " + data.description, 500);

  await env.DB.prepare("UPDATE scheduled_posts SET is_pinned=0 WHERE id=?").bind(id).run();
  return json({ success: true, clicks: post.clicks || 0 });
}

// POST /api/admin/posts/:id/cancel
async function adminCancelPost(request, env, id) {
  if (!checkAdminAuth(request)) return err("Forbidden", 403);
  await env.DB.prepare("UPDATE scheduled_posts SET status='cancelled' WHERE id=? AND status='pending'").bind(id).run();
  return json({ success: true });
}

// GET /track/:id — click tracking redirect
async function trackClick(env, id) {
  const post = await env.DB.prepare("SELECT * FROM scheduled_posts WHERE id = ?").bind(id).first();
  if (!post) return new Response("Not found", { status: 404 });

  // Increment click counter
  await env.DB.prepare("UPDATE scheduled_posts SET clicks = COALESCE(clicks, 0) + 1 WHERE id = ?").bind(id).run();

  const dest = post.button_url || "https://catalog-b8u.pages.dev";
  return Response.redirect(dest, 302);
}

// Internal: actually send the post to Telegram
async function sendScheduledPost(env, post) {
  const chatId = env.CHAT_ID || "-1002079877078";
  const token = env.BOT_TOKEN;
  const workerUrl = `https://ofb-catalog-api.8cctq5y6ty.workers.dev`;

  let text = post.text;
  if (post.mention_all) text = "📢 @channel\n\n" + text;

  const payload = {
    chat_id: chatId, text, parse_mode: "HTML",
    disable_notification: post.silent ? true : false
  };

  if (post.button_text && post.button_url) {
    // Use direct URL so users see the real destination; track clicks separately via /track/:id
    payload.reply_markup = {
      inline_keyboard: [[ { text: post.button_text, url: post.button_url } ]]
    };
  }

  let res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  let data = await res.json();

  // If HTML parsing failed, retry without parse_mode (plain text fallback)
  if (!data.ok && data.description && (data.description.includes("parse") || data.description.includes("entity"))) {
    const fallback = { ...payload };
    delete fallback.parse_mode;
    res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fallback)
    });
    data = await res.json();
  }

  if (!data.ok) return { ok: false, error: data.description };

  // Auto-pin
  await fetch(`https://api.telegram.org/bot${token}/pinChatMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: data.result.message_id })
  });

  // DM all users if requested
  if (post.dm_users) {
    const users = await env.DB.prepare("SELECT telegram_id FROM users WHERE telegram_id NOT LIKE 'dev_%'").all();
    for (const u of users.results) {
      try {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: u.telegram_id, text: post.text, parse_mode: "HTML",
            reply_markup: post.button_text && post.button_url ? {
              inline_keyboard: [[ { text: post.button_text, url: `${workerUrl}/track/${post.id}` } ]]
            } : undefined
          })
        });
      } catch {}
    }
  }

  return { ok: true, message_id: data.result.message_id };
}

// ─── TELEGRAM HELPERS ─────────────────────────────────────────────────────────

async function sendWeeklyPost(env) {
  const token = env.BOT_TOKEN;
  const chatId = env.CHAT_ID || "-1002079877078";
  const webappUrl = env.WEBAPP_URL || "https://catalog-b8u.pages.dev";

  // TOP-3 by avg_rating with at least 1 review
  const top3 = await env.DB.prepare(
    "SELECT name, telegram, avg_rating, reviews_count FROM listings WHERE status='approved' AND reviews_count > 0 ORDER BY avg_rating DESC, reviews_count DESC LIMIT 3"
  ).all().catch(() => ({ results: [] }));

  let topSection = '';
  if (top3.results.length > 0) {
    const medals = ['🥇', '🥈', '🥉'];
    topSection = '\n\n🏆 <b>ТОП-3 недели:</b>\n';
    top3.results.forEach((l, i) => {
      topSection += `${medals[i]} <b>${l.name}</b> ⭐ ${(l.avg_rating || 0).toFixed(1)} (${l.reviews_count} отз.) — @${l.telegram}\n`;
    });
  }

  const botUrl = `https://t.me/OnlyCatalog_bot`;
  const text = `🔥 <b>OFB Catalog — Биржа услуг OnlyFans</b>\n\nИщешь специалиста или работу? Всё здесь!\n\n✅ Модели, агентства, чаттеры\n✅ Фотографы, видеографы, SMM\n✅ Менеджеры и дизайнеры\n\n🆕 <b>РАЗМЕЩЕНИЕ БЕСПЛАТНОЕ</b>\n⭐ Премиум — карточка в ТОПе 3 месяца${topSection}\n\n👉 Открывай каталог и размещай заявку!`;

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[
          { text: "📋 Открыть каталог", url: botUrl }
        ]]
      }
    })
  });

  const data = await res.json();
  if (data.ok) {
    await fetch(`https://api.telegram.org/bot${token}/pinChatMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, message_id: data.result.message_id })
    });
  }
}

// ─── ROUTER ───────────────────────────────────────────────────────────────────

export default {
  async scheduled(event, env, ctx) {
    // Check and send scheduled posts (runs every 5 min)
    ctx.waitUntil((async () => {
      const now = new Date().toISOString();
      const pending = await env.DB.prepare(
        "SELECT * FROM scheduled_posts WHERE status='pending' AND scheduled_at IS NOT NULL AND scheduled_at <= ?"
      ).bind(now).all();

      for (const post of pending.results) {
        const result = await sendScheduledPost(env, post);
        if (result.ok) {
          // Check if this is a repeating post
          if (post.repeat_days && post.repeat_time) {
            const days = post.repeat_days.split(',').map(Number).filter(n => n >= 1 && n <= 7);
            let nextDate = null;
            const now = new Date();
            for (let i = 1; i <= 7; i++) {
              const d = new Date(now);
              d.setDate(d.getDate() + i);
              // JS getDay(): 0=Sun, 1-6=Mon-Sat; our days: 1=Mon, 7=Sun
              const dow = d.getDay() === 0 ? 7 : d.getDay();
              if (days.includes(dow)) {
                const [h, m] = post.repeat_time.split(':');
                d.setUTCHours(parseInt(h), parseInt(m), 0, 0);
                nextDate = d;
                break;
              }
            }
            const withinCampaign = !post.campaign_end || (nextDate && nextDate <= new Date(post.campaign_end + 'T23:59:59Z'));
            if (nextDate && withinCampaign) {
              await env.DB.prepare(
                "UPDATE scheduled_posts SET status='pending', scheduled_at=?, message_id=?, is_pinned=1, send_count=send_count+1 WHERE id=?"
              ).bind(nextDate.toISOString(), result.message_id, post.id).run();
            } else {
              await env.DB.prepare(
                "UPDATE scheduled_posts SET status='sent', sent_at=datetime('now'), message_id=?, is_pinned=1, send_count=send_count+1 WHERE id=?"
              ).bind(result.message_id, post.id).run();
            }
          } else {
            await env.DB.prepare(
              "UPDATE scheduled_posts SET status='sent', sent_at=datetime('now'), message_id=?, is_pinned=1 WHERE id=?"
            ).bind(result.message_id, post.id).run();
          }
        }
      }

      // Weekly post on Monday 10:00 UTC
      if (event.cron === "0 10 * * 1") {
        await sendWeeklyPost(env);
      }
    })());
  },

  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      // Telegram Widget Auth
      if (path === "/api/auth/telegram" && method === "POST") return authWithTelegram(request, env);

      // Listings
      if (path === "/api/listings" && method === "GET") return getListings(request, env);
      if (path === "/api/listings/premium" && method === "GET") return getPremiumListings(request, env);
      if (path === "/api/listings" && method === "POST") return createListing(request, env);

      const listingMatch = path.match(/^\/api\/listings\/(\d+)$/);
      if (listingMatch && method === "GET") return getListing(env, parseInt(listingMatch[1]));
      if (listingMatch && method === "DELETE") return deleteListing(request, env, parseInt(listingMatch[1]));

      const ratingsMatch = path.match(/^\/api\/listings\/(\d+)\/ratings$/);
      if (ratingsMatch && method === "GET") return getRatings(env, parseInt(ratingsMatch[1]));
      if (ratingsMatch && method === "POST") return createRating(request, env, parseInt(ratingsMatch[1]));

      const complaintsMatch = path.match(/^\/api\/listings\/(\d+)\/complaints$/);
      if (complaintsMatch && method === "POST") return createComplaint(request, env, parseInt(complaintsMatch[1]));

      // Jobs
      if (path === "/api/jobs" && method === "GET") return getJobs(request, env);
      if (path === "/api/jobs" && method === "POST") return createJob(request, env);

      const jobMatch = path.match(/^\/api\/jobs\/(\d+)$/);
      if (jobMatch && method === "DELETE") return deleteJob(request, env, parseInt(jobMatch[1]));

      // Favorites
      if (path === "/api/favorites" && method === "GET") return getFavorites(request, env);

      const favMatch = path.match(/^\/api\/favorites\/(\d+)$/);
      if (favMatch && method === "POST") return toggleFavorite(request, env, parseInt(favMatch[1]));

      const favCheckMatch = path.match(/^\/api\/favorites\/check\/(\d+)$/);
      if (favCheckMatch && method === "GET") return checkFavorite(request, env, parseInt(favCheckMatch[1]));

      // Profile
      if (path === "/api/profile" && method === "GET") return getProfile(request, env);
      if (path === "/api/profile" && method === "PUT") return updateProfile(request, env);
      if (path === "/api/profile/listings" && method === "GET") return getMyListings(request, env);

      // Notifications
      if (path === "/api/notifications" && method === "GET") return getNotifications(request, env);
      if (path === "/api/notifications/read" && method === "POST") return markNotificationsRead(request, env);

      // Subscriptions
      if (path === "/api/subscriptions" && method === "GET") return getSubscriptions(request, env);
      const subMatch = path.match(/^\/api\/subscriptions\/([^/]+)$/);
      if (subMatch && method === "POST") return toggleSubscription(request, env, subMatch[1]);

      // Listing available toggle
      const availMatch = path.match(/^\/api\/listings\/(\d+)\/available$/);
      if (availMatch && method === "POST") return toggleAvailable(request, env, parseInt(availMatch[1]));

      // Upload
      if (path === "/api/upload" && method === "POST") return handleUpload(request, env);

      // Admin
      if (path === "/api/admin/stats" && method === "GET") return adminStats(request, env);
      if (path === "/api/admin/listings/pending" && method === "GET") return adminPendingListings(request, env);
      if (path === "/api/admin/listings/all" && method === "GET") return adminAllListings(request, env);
      if (path === "/api/admin/complaints" && method === "GET") return adminComplaints(request, env);
      if (path === "/api/admin/notifications" && method === "GET") return adminGetNotifications(request, env);
      if (path === "/api/admin/notifications" && method === "POST") return adminSendNotification(request, env);
      if (path === "/api/admin/users" && method === "GET") return adminUsers(request, env);

      const adminListingMatch = path.match(/^\/api\/admin\/listings\/(\d+)\/(approve|reject|scam|premium)$/);
      if (adminListingMatch && method === "POST") {
        const [, id, action] = adminListingMatch;
        if (action === "approve") return adminApproveListing(request, env, parseInt(id));
        if (action === "reject") return adminRejectListing(request, env, parseInt(id));
        if (action === "scam") return adminToggleScam(request, env, parseInt(id));
        if (action === "premium") return adminTogglePremium(request, env, parseInt(id));
      }

      const adminComplaintMatch = path.match(/^\/api\/admin\/complaints\/(\d+)\/resolve$/);
      if (adminComplaintMatch && method === "POST") return adminResolveComplaint(request, env, parseInt(adminComplaintMatch[1]));

      const adminUserMatch = path.match(/^\/api\/admin\/users\/([^/]+)\/(verify|limit)$/);
      if (adminUserMatch && method === "POST") {
        const [, telegramId, action] = adminUserMatch;
        if (action === "verify") return adminVerifyUser(request, env, telegramId);
        if (action === "limit") return adminSetLimit(request, env, telegramId);
      }

      const adminJobMatch = path.match(/^\/api\/admin\/jobs\/(\d+)\/(approve|reject)$/);
      if (adminJobMatch && method === "POST") {
        const [, id, action] = adminJobMatch;
        if (action === "approve") return adminApproveJob(request, env, parseInt(id));
        if (action === "reject") return adminRejectJob(request, env, parseInt(id));
      }

      // Settings
      if (path === "/api/admin/settings" && method === "GET") return adminGetSettings(request, env);
      if (path === "/api/admin/settings" && method === "PUT") return adminUpdateSettings(request, env);
      if (path === "/api/admin/setup-webhook" && method === "POST") return adminSetupWebhook(request, env);
      if (path === "/api/admin/setup-menu-button" && method === "POST") return adminSetupMenuButton(request, env);

      // Telegram webhook
      if (path === "/webhook" && method === "POST") return handleWebhook(request, env);

      // Scheduled posts
      if (path === "/api/admin/posts" && method === "GET") return adminGetPosts(request, env);
      if (path === "/api/admin/posts" && method === "POST") return adminCreatePost(request, env);

      const postMatch = path.match(/^\/api\/admin\/posts\/(\d+)\/(send|pin|unpin|cancel)$/);
      if (postMatch && method === "POST") {
        const [, pid, action] = postMatch;
        if (action === "send") return adminSendPost(request, env, parseInt(pid));
        if (action === "pin") return adminPinPost(request, env, parseInt(pid));
        if (action === "unpin") return adminUnpinPost(request, env, parseInt(pid));
        if (action === "cancel") return adminCancelPost(request, env, parseInt(pid));
      }

      // Click tracking redirect
      const trackMatch = path.match(/^\/track\/(\d+)$/);
      if (trackMatch && method === "GET") return trackClick(env, parseInt(trackMatch[1]));

      return err("Not found", 404);
    } catch (e) {
      return err("Server error: " + e.message, 500);
    }
  },
};
