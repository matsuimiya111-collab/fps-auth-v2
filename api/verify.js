import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

function json(res, status, data) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { ok: false, message: "Method not allowed" });
  }

  try {
    const { code } = req.body || {};

    if (!code || typeof code !== "string") {
      return json(res, 200, { ok: false, message: "缺少授权码" });
    }

    const cleanCode = code.trim();
    const key = `auth:${cleanCode}`;
    const item = await redis.hgetall(key);

    if (!item || !item.code) {
      return json(res, 200, { ok: false, message: "授权码不存在" });
    }

    if (String(item.enabled) !== "true") {
      return json(res, 200, { ok: false, message: "授权码已停用" });
    }

    const remaining = Number(item.remaining || 0);

    return json(res, 200, {
      ok: true,
      message: "授权有效",
      remaining
    });
  } catch (err) {
    return json(res, 500, {
      ok: false,
      message: "服务器错误",
      error: err.message
    });
  }
}