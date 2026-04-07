import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

function json(res, status, data) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

export default async function handler(req, res) {
  try {
    const code =
      req.method === "GET"
        ? req.query?.code
        : req.body?.code;

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

    if (remaining <= 0) {
      return json(res, 200, {
        ok: false,
        remaining: 0,
        message: "本授权使用次数已用完，请联系管理员续费"
      });
    }

    const nextRemaining = remaining - 1;

    await redis.hset(key, {
      ...item,
      remaining: nextRemaining,
      updatedAt: new Date().toISOString()
    });

    return json(res, 200, {
      ok: true,
      code: cleanCode,
      remaining: nextRemaining,
      message: "扣减成功"
    });
  } catch (err) {
    return json(res, 500, {
      ok: false,
      message: "服务器错误",
      error: err.message
    });
  }
}
