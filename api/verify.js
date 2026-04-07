import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

function send(res, status, data) {
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.end(JSON.stringify(data));
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    return send(res, 200, { ok: true });
  }

  try {
    const code =
      req.method === "GET"
        ? req.query?.code
        : req.body?.code;

    if (!code || typeof code !== "string") {
      return send(res, 200, { ok: false, message: "缺少授权码" });
    }

    const cleanCode = code.trim();
    const key = `auth:${cleanCode}`;
    const item = await redis.hgetall(key);

    if (!item || !item.code) {
      return send(res, 200, { ok: false, message: "授权码不存在" });
    }

    if (String(item.enabled) !== "true") {
      return send(res, 200, { ok: false, message: "授权码已停用" });
    }

    const remaining = Number(item.remaining || 0);

    return send(res, 200, {
      ok: true,
      code: cleanCode,
      remaining
    });
  } catch (err) {
    return send(res, 500, {
      ok: false,
      message: "服务器错误",
      error: err.message
    });
  }
}
