import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const allowedOrigins = new Set([
  "https://achilles1030.github.io",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
]);

const jsonHeaders = (origin: string | null) => ({
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": origin && allowedOrigins.has(origin) ? origin : "https://achilles1030.github.io",
  "Access-Control-Allow-Headers": "content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
  "Cache-Control": "no-store",
});

const respond = (origin: string | null, status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders(origin) });

const normalizeOptional = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const sha256 = async (value: string) => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    if (!origin || !allowedOrigins.has(origin)) return respond(origin, 403, { error: "Origin not allowed" });
    return new Response("ok", { headers: jsonHeaders(origin) });
  }

  if (req.method !== "POST") return respond(origin, 405, { error: "Method not allowed" });
  if (origin && !allowedOrigins.has(origin)) return respond(origin, 403, { error: "Origin not allowed" });

  const contentLength = Number(req.headers.get("content-length") || "0");
  if (contentLength > 16_384) return respond(origin, 413, { error: "Request too large" });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return respond(origin, 400, { error: "Invalid JSON" });
  }

  if (typeof body.website === "string" && body.website.trim()) {
    return respond(origin, 200, { ok: true });
  }

  const nickname = normalizeOptional(body.nickname);
  const email = normalizeOptional(body.email)?.toLowerCase() ?? null;
  const message = normalizeOptional(body.message);
  const emailPattern = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

  if ((nickname?.length ?? 0) > 40) return respond(origin, 400, { error: "昵称不能超过 40 个字符" });
  if (email && (email.length > 254 || !emailPattern.test(email))) return respond(origin, 400, { error: "邮箱格式不正确" });
  if (!message || message.length > 2000) return respond(origin, 400, { error: "反馈内容应为 1–2000 个字符" });

  const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
  const secretKey = secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!secretKey || !supabaseUrl) return respond(origin, 500, { error: "Server configuration error" });

  const supabaseAdmin = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const clientIp = req.headers.get("cf-connecting-ip") || forwarded || "unknown";
  const identifierHash = await sha256(`${secretKey}:${clientIp}`);
  const now = Date.now();
  const minuteAgo = new Date(now - 60_000).toISOString();
  const hourAgo = new Date(now - 3_600_000).toISOString();

  const [{ count: minuteCount, error: minuteError }, { count: hourCount, error: hourError }] = await Promise.all([
    supabaseAdmin.from("feedback_rate_limits").select("id", { count: "exact", head: true }).eq("identifier_hash", identifierHash).gte("created_at", minuteAgo),
    supabaseAdmin.from("feedback_rate_limits").select("id", { count: "exact", head: true }).eq("identifier_hash", identifierHash).gte("created_at", hourAgo),
  ]);

  if (minuteError || hourError) return respond(origin, 500, { error: "Rate limit check failed" });
  if ((minuteCount ?? 0) >= 3 || (hourCount ?? 0) >= 10) {
    return respond(origin, 429, { error: "提交过于频繁，请稍后再试" });
  }

  const { error: rateError } = await supabaseAdmin.from("feedback_rate_limits").insert({ identifier_hash: identifierHash });
  if (rateError) return respond(origin, 500, { error: "Rate limit write failed" });

  const { error: insertError } = await supabaseAdmin.from("feedback").insert({ nickname, email, message });
  if (insertError) return respond(origin, 500, { error: "提交失败，请稍后再试" });

  if (Math.random() < 0.02) {
    await supabaseAdmin.from("feedback_rate_limits").delete().lt("created_at", new Date(now - 86_400_000).toISOString());
  }

  return respond(origin, 201, { ok: true });
});
