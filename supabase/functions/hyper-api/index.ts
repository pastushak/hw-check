// hw-check · посередник між сторінкою і Claude API
// Supabase → Edge Functions → hyper-api → Code → замінити весь код цим → Deploy.
// Секрет ANTHROPIC_API_KEY лежить у Edge Functions → Secrets і на сторінку не потрапляє.
// У налаштуваннях функції «Verify JWT» має бути ВИМКНЕНО: перевірку входу робить сам код нижче.

import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const ALLOWED_MODELS = ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"];
const ALLOWED_EFFORT = ["low", "medium", "high", "xhigh", "max"];
const MAX_TOKENS_CAP = 32000;
const RETRY_STATUSES = [429, 500, 502, 503, 529];

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  const ok = origin === "https://pastushak.github.io" ||
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : "https://pastushak.github.io",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

Deno.serve(async (req) => {
  const CORS = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const json = (obj: unknown, status: number) =>
    new Response(JSON.stringify(obj), { status, headers: { ...CORS, "content-type": "application/json" } });

  // 1. Хто викликає: потрібен вхід і саме власник
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: { message: "Потрібно увійти" } }, 401);
  const { data: owner, error: ownerErr } = await supabase.rpc("is_owner");
  if (ownerErr || owner !== true) return json({ error: { message: "Немає доступу" } }, 403);

  // 2. Перевіряємо запит
  let body: any;
  try { body = await req.json(); } catch { return json({ error: { message: "Некоректний запит" } }, 400); }
  if (!ALLOWED_MODELS.includes(body.model)) return json({ error: { message: "Невідома модель" } }, 400);
  if (!Array.isArray(body.messages) || !body.messages.length) return json({ error: { message: "Порожній запит" } }, 400);

  const payload: Record<string, unknown> = {
    model: body.model,
    max_tokens: Math.min(Math.max(Number(body.max_tokens) || 16000, 1000), MAX_TOKENS_CAP),
    system: body.system,
    messages: body.messages,
    stream: true,
  };
  if (ALLOWED_EFFORT.includes(body.effort)) payload.output_config = { effort: body.effort };
  if (body.cache === true) payload.cache_control = { type: "ephemeral" };   // кеш для уточнень

  // 3. Запит до Claude; при перевантаженні — до 2 повторів
  let r: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
    });
    if (r.ok || !RETRY_STATUSES.includes(r.status) || attempt === 2) break;
    await r.body?.cancel();
    const wait = Number(r.headers.get("retry-after")) || (attempt + 1) * 3;
    await new Promise((res) => setTimeout(res, Math.min(wait, 10) * 1000));
  }

  // 4. Віддаємо потік сторінці як є
  return new Response(r!.body, {
    status: r!.status,
    headers: { ...CORS, "content-type": r!.headers.get("content-type") ?? "text/event-stream" },
  });
});
