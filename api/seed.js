import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

function json(res, status, data) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return json(res, 405, { ok: false, message: "Method not allowed" });
  }

  try {
    const now = new Date().toISOString();

    await redis.hset("auth:VIP001", {
      code: "VIP001",
      enabled: "true",
      remaining: 100,
      createdAt: now,
      updatedAt: now
    });

    await redis.hset("auth:TEST888", {
      code: "TEST888",
      enabled: "true",
      remaining: 10,
      createdAt: now,
      updatedAt: now
    });

    return json(res, 200, {
      ok: true,
      message: "初始化完成"
    });
  } catch (err) {
    return json(res, 500, {
      ok: false,
      message: "初始化失败",
      error: err.message
    });
  }
}