// ════════ НАЛАШТУВАННЯ hw-check ════════
// Supabase → Project Settings → API: Project URL і публічний ключ (publishable / anon).
// Цей ключ публічний — його можна тримати тут. Ключ service_role / secret сюди НЕ вставляти.
const CONFIG = {
  SUPABASE_URL: 'https://cwcoobigdegwfpuubmdv.supabase.co',
  SUPABASE_KEY: 'sb_publishable_X5AwVXrPsPvqroZZwIraGQ_nh4j6CXw',
  FUNCTION: 'hyper-api',   // назва Edge Function у Supabase
  BUCKET: 'hw',            // сховище фото робіт і рисунків

  // Ціни Claude API, $ за 1 млн токенів (platform.claude.com/docs/en/about-claude/pricing, листопад 2026).
  // in — вхід, out — вихід, cw — запис у кеш, cr — читання з кешу.
  PRICES: {
    'claude-opus-5-5':   { in: 4,    out: 20,  cw: 5,     cr: 0.20 },
    'claude-sonnet-5-5': { in: 2,    out: 10,  cw: 2.5,   cr: 0.10 },
    'claude-haiku-5-5':  { in: 0.10, out: 0.5, cw: 0.125, cr: 0.01,
                           long: { in: 0.5, out: 2.5, cw: 0.625, cr: 0.05 } }  // запит > 100 тис. токенів
  },
  // Курс для показу витрат у гривнях. null — показувати лише долари.
  USD_TO_UAH: null
};
