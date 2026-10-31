-- =====================================================================
-- AIT SMART FEE KEEPER: database setup
-- Run this once in Supabase: SQL Editor > New query > paste > Run.
-- It is safe to run again later; it will not delete any records.
-- =====================================================================

-- ---------- 1. People (one row per login) ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  role        text not null default 'viewer' check (role in ('admin','bursar','viewer')),
  active      boolean not null default false,
  created_at  timestamptz not null default now()
);

-- The role of the signed-in person, or null if they are not active.
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;
revoke all on function public.my_role() from public, anon;
grant execute on function public.my_role() to authenticated;

-- ---------- 2. Pupils, payments, class fees ----------
create or replace function public.name_key(n text) returns text
language sql immutable as $$
  select coalesce(string_agg(w, ' ' order by w collate "C"), '')
  from regexp_split_to_table(
         lower(regexp_replace(coalesce(n,''), '[^[:alnum:][:space:]]', '', 'g')),
         '\s+') as w
  where w <> ''
$$;

create table if not exists public.students (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(btrim(name)) between 2 and 120),
  name_key        text not null,
  cls             text not null,
  custom_fee      numeric(12,2) check (custom_fee is null or custom_fee >= 0),
  archived        boolean not null default false,
  archive_reason  text,
  created_at      timestamptz not null default now(),
  created_by      uuid default auth.uid()
);
-- The same name (in any word order, any capitalisation) can only exist once.
create unique index if not exists students_name_key_uq on public.students(name_key);

create table if not exists public.payments (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students(id),
  amount      numeric(12,2) not null check (amount > 0 and amount <= 10000000),
  paid_on     date not null default current_date,
  note        text check (note is null or length(note) <= 300),
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  voided      boolean not null default false,
  void_reason text,
  voided_by   uuid,
  voided_at   timestamptz
);
create index if not exists payments_student_idx on public.payments(student_id);

create table if not exists public.class_fees (
  cls         text primary key,
  fee         numeric(12,2) not null check (fee >= 0),
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid()
);

-- ---------- 3. Activity log (written only by the database itself) ----------
create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  user_id    uuid,
  user_name  text,
  action     text not null,
  details    text not null
);

create or replace function public.audit_locked() returns trigger
language plpgsql as $$
begin
  raise exception 'The activity log cannot be changed or deleted';
end $$;
drop trigger if exists audit_no_change on public.audit_log;
create trigger audit_no_change before update or delete on public.audit_log
  for each row execute function public.audit_locked();
drop trigger if exists audit_no_truncate on public.audit_log;
create trigger audit_no_truncate before truncate on public.audit_log
  for each statement execute function public.audit_locked();

create or replace function public.write_audit(a text, d text) returns void
language sql security definer set search_path = public as $$
  insert into public.audit_log(user_id, user_name, action, details)
  values (auth.uid(),
          coalesce((select coalesce(nullif(btrim(full_name),''), email) from public.profiles where id = auth.uid()), 'System'),
          a, d)
$$;
revoke all on function public.write_audit(text, text) from public, anon, authenticated;

create or replace function public.money_text(x numeric) returns text
language sql immutable as $$ select 'GH₵' || to_char(x, 'FM999,999,990.00') $$;

-- ---------- 4. Rules that protect the records ----------
-- Pupils: tidy the name, stop duplicates, limit who can change fees and archive.
create or replace function public.students_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare is_admin boolean := (auth.uid() is null) or (public.my_role() = 'admin');
begin
  new.name := regexp_replace(btrim(new.name), '\s+', ' ', 'g');
  new.name_key := public.name_key(new.name);
  if new.name_key = '' then raise exception 'Enter the pupil''s name'; end if;
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.archived := false; new.archive_reason := null;
  else
    if not is_admin and (new.custom_fee is distinct from old.custom_fee
                         or new.archived <> old.archived
                         or new.archive_reason is distinct from old.archive_reason) then
      raise exception 'Only an admin can set custom fees or archive pupils';
    end if;
    if new.archived and not old.archived and btrim(coalesce(new.archive_reason,'')) = '' then
      raise exception 'A reason is required to archive a pupil';
    end if;
    if not new.archived then new.archive_reason := null; end if;
    new.created_at := old.created_at; new.created_by := old.created_by;
  end if;
  return new;
end $$;
drop trigger if exists students_guard_trg on public.students;
create trigger students_guard_trg before insert or update on public.students
  for each row execute function public.students_guard();

-- Payments: never edited or deleted. A payment can only be voided, by an admin, with a reason.
create or replace function public.payments_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.voided := false; new.void_reason := null; new.voided_by := null; new.voided_at := null;
    if exists (select 1 from public.students where id = new.student_id and archived) then
      raise exception 'This pupil is archived. Ask an admin to restore them first';
    end if;
    return new;
  end if;
  if auth.uid() is not null and coalesce(public.my_role(), '') <> 'admin' then
    raise exception 'Only an admin can void payments';
  end if;
  if new.student_id <> old.student_id or new.amount <> old.amount or new.paid_on <> old.paid_on
     or new.note is distinct from old.note or new.created_at <> old.created_at
     or new.created_by is distinct from old.created_by then
    raise exception 'Payments cannot be edited. Void the payment and record a new one';
  end if;
  if old.voided then raise exception 'This payment is already voided'; end if;
  if not new.voided then raise exception 'Nothing to change'; end if;
  if btrim(coalesce(new.void_reason,'')) = '' then raise exception 'A reason is required to void a payment'; end if;
  new.voided_by := auth.uid(); new.voided_at := now();
  return new;
end $$;
drop trigger if exists payments_guard_trg on public.payments;
create trigger payments_guard_trg before insert or update on public.payments
  for each row execute function public.payments_guard();

create or replace function public.class_fees_guard() returns trigger
language plpgsql as $$
begin
  new.updated_at := now(); new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists class_fees_guard_trg on public.class_fees;
create trigger class_fees_guard_trg before insert or update on public.class_fees
  for each row execute function public.class_fees_guard();

-- People: the system must always keep at least one active admin.
create or replace function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.id <> old.id then raise exception 'Not allowed'; end if;
  if old.role = 'admin' and old.active and (new.role <> 'admin' or not new.active)
     and not exists (select 1 from public.profiles where role = 'admin' and active and id <> old.id) then
    raise exception 'There must always be at least one active admin';
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard_trg on public.profiles;
create trigger profiles_guard_trg before update on public.profiles
  for each row execute function public.profiles_guard();

-- ---------- 5. Automatic activity log entries ----------
create or replace function public.students_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit('pupil_add', format('Added pupil %s (%s)', new.name, new.cls));
  else
    if new.name <> old.name then
      perform public.write_audit('pupil_edit', format('Renamed %s to %s', old.name, new.name)); end if;
    if new.cls <> old.cls then
      perform public.write_audit('pupil_edit', format('Moved %s from %s to %s', new.name, old.cls, new.cls)); end if;
    if new.custom_fee is distinct from old.custom_fee then
      perform public.write_audit('fees_set', format('Custom fee for %s changed from %s to %s', new.name,
        coalesce(public.money_text(old.custom_fee), 'class fee'), coalesce(public.money_text(new.custom_fee), 'class fee'))); end if;
    if new.archived <> old.archived then
      perform public.write_audit(case when new.archived then 'pupil_archive' else 'pupil_restore' end,
        case when new.archived then format('Archived %s (%s). Reason: %s', new.name, new.cls, new.archive_reason)
             else format('Restored %s (%s)', new.name, new.cls) end); end if;
  end if;
  return null;
end $$;
drop trigger if exists students_audit_trg on public.students;
create trigger students_audit_trg after insert or update on public.students
  for each row execute function public.students_audit();

create or replace function public.payments_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare n text; c text;
begin
  select name, cls into n, c from public.students where id = new.student_id;
  if tg_op = 'INSERT' then
    perform public.write_audit('payment', format('Recorded %s for %s (%s), paid %s%s', public.money_text(new.amount), n, c,
      to_char(new.paid_on, 'DD Mon YYYY'), case when coalesce(new.note,'') <> '' then ' - ' || new.note else '' end));
  elsif new.voided and not old.voided then
    perform public.write_audit('payment_void', format('Voided %s for %s (%s), paid %s. Reason: %s', public.money_text(new.amount), n, c,
      to_char(new.paid_on, 'DD Mon YYYY'), new.void_reason));
  end if;
  return null;
end $$;
drop trigger if exists payments_audit_trg on public.payments;
create trigger payments_audit_trg after insert or update on public.payments
  for each row execute function public.payments_audit();

create or replace function public.class_fees_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit('fees_set', format('Set fee for %s to %s', new.cls, public.money_text(new.fee)));
  elsif new.fee <> old.fee then
    perform public.write_audit('fees_set', format('Changed fee for %s from %s to %s', new.cls, public.money_text(old.fee), public.money_text(new.fee)));
  end if;
  return null;
end $$;
drop trigger if exists class_fees_audit_trg on public.class_fees;
create trigger class_fees_audit_trg after insert or update on public.class_fees
  for each row execute function public.class_fees_audit();

create or replace function public.profiles_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text := coalesce(nullif(btrim(new.full_name),''), new.email);
begin
  if tg_op = 'INSERT' then
    if new.active then perform public.write_audit('user', format('First administrator created: %s', who));
    else perform public.write_audit('user', format('New sign-up waiting for approval: %s', who)); end if;
  else
    if new.active <> old.active then
      perform public.write_audit('user', case when new.active then format('Approved %s as %s', who, new.role) else format('Disabled access for %s', who) end);
    elsif new.role <> old.role then
      perform public.write_audit('user', format('Changed role of %s from %s to %s', who, old.role, new.role));
    end if;
  end if;
  return null;
end $$;
drop trigger if exists profiles_audit_trg on public.profiles;
create trigger profiles_audit_trg after insert or update on public.profiles
  for each row execute function public.profiles_audit();

-- ---------- 6. New logins ----------
-- The very first login becomes the admin. Everyone after that waits for approval.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare first_user boolean;
begin
  select not exists (select 1 from public.profiles) into first_user;
  insert into public.profiles(id, email, full_name, role, active)
  values (new.id, new.email, nullif(btrim(coalesce(new.raw_user_meta_data->>'full_name','')), ''),
          case when first_user then 'admin' else 'viewer' end, first_user);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Logins made before this script ran
insert into public.profiles(id, email, full_name, role, active)
select u.id, u.email, nullif(btrim(coalesce(u.raw_user_meta_data->>'full_name','')), ''), 'viewer', false
from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id);
update public.profiles set role = 'admin', active = true
where id = (select id from public.profiles order by created_at limit 1)
  and not exists (select 1 from public.profiles where role = 'admin' and active);

-- ---------- 7. Who can see and do what ----------
alter table public.profiles   enable row level security;
alter table public.students   enable row level security;
alter table public.payments   enable row level security;
alter table public.class_fees enable row level security;
alter table public.audit_log  enable row level security;

drop policy if exists profiles_read   on public.profiles;
drop policy if exists profiles_update on public.profiles;
create policy profiles_read   on public.profiles for select to authenticated
  using (id = auth.uid() or (select public.my_role()) = 'admin');
create policy profiles_update on public.profiles for update to authenticated
  using ((select public.my_role()) = 'admin') with check ((select public.my_role()) = 'admin');

drop policy if exists students_read   on public.students;
drop policy if exists students_insert on public.students;
drop policy if exists students_update on public.students;
create policy students_read   on public.students for select to authenticated
  using ((select public.my_role()) is not null);
create policy students_insert on public.students for insert to authenticated
  with check ((select public.my_role()) in ('admin','bursar'));
create policy students_update on public.students for update to authenticated
  using ((select public.my_role()) in ('admin','bursar')) with check ((select public.my_role()) in ('admin','bursar'));

drop policy if exists payments_read   on public.payments;
drop policy if exists payments_insert on public.payments;
drop policy if exists payments_update on public.payments;
create policy payments_read   on public.payments for select to authenticated
  using ((select public.my_role()) is not null);
create policy payments_insert on public.payments for insert to authenticated
  with check ((select public.my_role()) in ('admin','bursar'));
create policy payments_update on public.payments for update to authenticated
  using ((select public.my_role()) = 'admin') with check ((select public.my_role()) = 'admin');

drop policy if exists class_fees_read   on public.class_fees;
drop policy if exists class_fees_insert on public.class_fees;
drop policy if exists class_fees_update on public.class_fees;
create policy class_fees_read   on public.class_fees for select to authenticated
  using ((select public.my_role()) is not null);
create policy class_fees_insert on public.class_fees for insert to authenticated
  with check ((select public.my_role()) = 'admin');
create policy class_fees_update on public.class_fees for update to authenticated
  using ((select public.my_role()) = 'admin') with check ((select public.my_role()) = 'admin');

drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log for select to authenticated
  using ((select public.my_role()) = 'admin');

-- Table permissions: signed-out visitors get nothing; signed-in users only the columns they need.
revoke all on public.profiles, public.students, public.payments, public.class_fees, public.audit_log from anon, authenticated;
grant select on public.profiles, public.students, public.payments, public.class_fees, public.audit_log to authenticated;
grant update (role, active, full_name) on public.profiles to authenticated;
grant insert (name, cls) on public.students to authenticated;
grant update (name, cls, custom_fee, archived, archive_reason) on public.students to authenticated;
grant insert (student_id, amount, paid_on, note) on public.payments to authenticated;
grant update (voided, void_reason) on public.payments to authenticated;
grant insert (cls, fee) on public.class_fees to authenticated;
grant update (fee) on public.class_fees to authenticated;

-- ---------- 8. Live updates between devices ----------
do $$
declare t text;
begin
  foreach t in array array['students','payments','class_fees','profiles'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
             when undefined_object then null;
    end;
  end loop;
end $$;
