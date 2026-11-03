-- ════════════════════════════════════════════════════════════════════
--  hw-check · ПОВНА схема бази (для нового проєкту Supabase з нуля)
--  Для вже наявного проєкту запускай не цей файл, а migration-*.sql.
--
--  Порядок для нового проєкту:
--   1) Authentication → Users → Add user (твій email + пароль, Auto Confirm)
--   2) Authentication → Sign In / Providers → вимкнути «Allow new users to sign up»
--   3) SQL Editor → цей файл → Run
--   4) Edge Functions → hyper-api (код у supabase/functions/hyper-api/index.ts),
--      секрет ANTHROPIC_API_KEY
-- ════════════════════════════════════════════════════════════════════

-- ─── Власник ────────────────────────────────────────────────────────
create table if not exists app_owner (
  id uuid primary key references auth.users(id) on delete cascade
);
alter table app_owner enable row level security;

do $$
declare n int;
begin
  if not exists (select 1 from app_owner) then
    select count(*) into n from auth.users;
    if n <> 1 then
      raise exception 'В Authentication → Users має бути рівно 1 користувач (зараз: %).', n;
    end if;
    insert into app_owner select id from auth.users;
  end if;
end $$;

create or replace function is_owner() returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from app_owner where id = auth.uid()) $$;
revoke all on function is_owner() from public, anon;
grant execute on function is_owner() to authenticated;

-- ─── Учні ───────────────────────────────────────────────────────────
create table if not exists students (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  full_name   text not null unique,
  gender      text check (gender in ('ч','ж')),
  grp         text,
  active      boolean not null default true
);

-- ─── Перевірки ──────────────────────────────────────────────────────
create table if not exists hw_checks (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  student_name  text not null,
  gender        text check (gender in ('ч','ж')),
  pupil_id      uuid,
  kind          text not null check (kind in ('hw','test')),
  paragraph     int  check (paragraph between 1 and 26),
  test_no       int  check (test_no between 1 and 50),
  problems      text,
  model         text,
  effort        text,
  note          text,
  report        text,
  examples      text,
  ai_verdict    text,
  verdict       text check (verdict in ('зараховано','на доопрацювання')),
  confirmed_at  timestamptz,
  tokens_in     int,
  tokens_out    int,
  cost_usd      numeric(10,4),
  photos        text[]
);
create index if not exists hw_checks_student_idx on hw_checks (student_name, created_at desc);

create table if not exists hw_items (
  id            bigint generated always as identity primary key,
  check_id      bigint not null references hw_checks(id) on delete cascade,
  created_at    timestamptz not null default now(),
  student_name  text not null,
  paragraph     int,
  test_no       int,
  problem       text not null,
  status        text not null check (status in ('ok','error','partial','unclear','missing')),
  error_type    text,
  comment       text
);
create index if not exists hw_items_student_idx on hw_items (student_name, paragraph);
create index if not exists hw_items_problem_idx on hw_items (paragraph, problem);

-- ─── Банк задач ─────────────────────────────────────────────────────
create table if not exists problems (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  kind        text not null default 'hw' check (kind in ('hw','test')),
  paragraph   int  check (paragraph between 1 and 26),
  test_no     int  check (test_no between 1 and 50),
  number      text not null,
  seq         int,
  condition   text,
  answer      text,
  has_figure  boolean not null default false,
  figure_note text,
  figure_path text,
  page        int,
  verified    boolean not null default false,
  unique nulls not distinct (kind, paragraph, test_no, number)
);
create index if not exists problems_para_idx on problems (paragraph, seq);

-- ─── Витрати ────────────────────────────────────────────────────────
create table if not exists ai_usage (
  id                 bigint generated always as identity primary key,
  created_at         timestamptz not null default now(),
  purpose            text not null,
  model              text not null,
  input_tokens       int not null default 0,
  output_tokens      int not null default 0,
  cache_write_tokens int not null default 0,
  cache_read_tokens  int not null default 0,
  cost_usd           numeric(10,5),
  check_id           bigint references hw_checks(id) on delete set null
);
create index if not exists ai_usage_created_idx on ai_usage (created_at desc);

-- ─── Доступ: лише власник ───────────────────────────────────────────
alter table students  enable row level security;
alter table hw_checks enable row level security;
alter table hw_items  enable row level security;
alter table problems  enable row level security;
alter table ai_usage  enable row level security;

drop policy if exists "owner all students"  on students;
drop policy if exists "owner all hw_checks" on hw_checks;
drop policy if exists "owner all hw_items"  on hw_items;
drop policy if exists "owner all problems"  on problems;
drop policy if exists "owner all ai_usage"  on ai_usage;
create policy "owner all students"  on students  for all to authenticated using (is_owner()) with check (is_owner());
create policy "owner all hw_checks" on hw_checks for all to authenticated using (is_owner()) with check (is_owner());
create policy "owner all hw_items"  on hw_items  for all to authenticated using (is_owner()) with check (is_owner());
create policy "owner all problems"  on problems  for all to authenticated using (is_owner()) with check (is_owner());
create policy "owner all ai_usage"  on ai_usage  for all to authenticated using (is_owner()) with check (is_owner());

-- ─── Перейменування учня → оновлення статистики ─────────────────────
create or replace function students_rename_cascade() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.full_name is distinct from old.full_name then
    update hw_checks set student_name = new.full_name where student_name = old.full_name;
    update hw_items  set student_name = new.full_name where student_name = old.full_name;
  end if;
  return new;
end $$;
drop trigger if exists trg_students_rename on students;
create trigger trg_students_rename after update of full_name on students
  for each row execute function students_rename_cascade();

-- ─── Збереження перевірки одним кроком ──────────────────────────────
create or replace function save_check(p_check jsonb, p_items jsonb, p_id bigint default null)
returns bigint
language plpgsql security invoker set search_path = public as $$
declare v_id bigint;
begin
  if not is_owner() then raise exception 'Немає доступу'; end if;

  if p_id is null then
    insert into hw_checks (student_name, gender, kind, paragraph, test_no, problems, model, effort, note,
                           report, examples, ai_verdict, verdict, confirmed_at, tokens_in, tokens_out, cost_usd, photos)
    select r.student_name, r.gender, r.kind, r.paragraph, r.test_no, r.problems, r.model, r.effort, r.note,
           r.report, r.examples, r.ai_verdict, r.verdict, now(), r.tokens_in, r.tokens_out, r.cost_usd, r.photos
    from jsonb_populate_record(null::hw_checks, p_check) r
    returning id into v_id;
  else
    update hw_checks h set
      report = r.report, examples = r.examples, ai_verdict = r.ai_verdict, verdict = r.verdict,
      confirmed_at = now(), tokens_in = r.tokens_in, tokens_out = r.tokens_out, cost_usd = r.cost_usd,
      photos = coalesce(r.photos, h.photos), note = coalesce(r.note, h.note)
    from jsonb_populate_record(null::hw_checks, p_check) r
    where h.id = p_id
    returning h.id into v_id;
    if v_id is null then raise exception 'Перевірку % не знайдено', p_id; end if;
    delete from hw_items where check_id = v_id;
  end if;

  insert into hw_items (check_id, student_name, paragraph, test_no, problem, status, error_type, comment)
  select v_id, h.student_name, h.paragraph, h.test_no, i.problem, i.status, nullif(i.error_type, ''), nullif(i.comment, '')
  from hw_checks h
  cross join jsonb_to_recordset(p_items) as i(problem text, status text, error_type text, comment text)
  where h.id = v_id and coalesce(i.problem, '') <> '';

  return v_id;
end $$;
grant execute on function save_check(jsonb, jsonb, bigint) to authenticated;

-- ─── Сховище ────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public) values ('hw', 'hw', false)
on conflict (id) do nothing;

drop policy if exists "owner hw bucket" on storage.objects;
create policy "owner hw bucket" on storage.objects for all to authenticated
  using (bucket_id = 'hw' and public.is_owner())
  with check (bucket_id = 'hw' and public.is_owner());
