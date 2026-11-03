# hw-check — перевірка домашніх робіт з математики (НМТ)

Сторінка: https://pastushak.github.io/hw-check/

Фото роботи учня → Claude перевіряє за еталоном з банку задач → учитель підтверджує статуси → статистика, журнал, приклади й звіт для учня.

## Як влаштовано

| Частина | Де живе |
|---|---|
| Сторінка (HTML/CSS/JS) | цей репозиторій → GitHub Pages |
| База, вхід, сховище фото | Supabase |
| Ключ Claude API | Supabase → Edge Functions → Secrets (`ANTHROPIC_API_KEY`) |
| Посередник до Claude | Edge Function `hyper-api` |

```
index.html            розмітка
app.css               стилі
config.js             адреса Supabase, публічний ключ, ціни Claude  ← свої налаштування тут
js/core.js            спільне: Supabase, виклик Claude, формули, фото, експорт
js/auth.js            вхід, «Забули пароль?», зміна пароля
js/students.js        учні
js/check.js           перевірка, приклади, збереження, «для учня»
js/journal.js         журнал і повторна перевірка з архіву
js/stats.js           статистика, витрати, звіт для учня
js/bank.js            банк задач, розпізнавання сторінок і рисунків
js/main.js            навігація і запуск
supabase/schema.sql               повна схема бази (для нового проєкту)
supabase/migration-2026-11.sql    оновлення наявного проєкту (листопад 2026)
supabase/functions/hyper-api/index.ts   код Edge Function
```

## Оновлення

1. Нові SQL-міграції (якщо є) → Supabase → SQL Editor → Run.
2. Новий код функції (якщо змінився) → Edge Functions → `hyper-api` → Code → Deploy.
3. Файли сторінки → `git add -A && git commit -m "…" && git push`, у браузері Ctrl+F5.

`config.js` при оновленнях не змінюється — адресу й ключ переносити не треба.

## Безпека

- Ключ Claude є тільки в секретах Supabase, на сторінці його немає.
- Публічний ключ Supabase у `config.js` можна показувати: дані закриті входом і правилами доступу.
- Таблиці, сховище й функція доступні лише власнику (`app_owner`), навіть якщо колись увімкнути реєстрацію.
- Ключ `service_role` / `secret` ніколи не вставляти в цей репозиторій.
