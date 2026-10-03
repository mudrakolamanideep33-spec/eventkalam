-- Run this once in Supabase: SQL Editor > New query > Run
create extension if not exists pgcrypto;

create table profiles(
  id uuid primary key references auth.users on delete cascade,
  full_name text not null, phone text not null, college text, city text,
  role text not null default 'member' check (role in ('member','admin')),
  created_at timestamptz default now());

create table events(
  id uuid primary key default gen_random_uuid(),
  title text not null, description text, category text default 'Workshop',
  event_date date not null, start_time time not null, end_time time not null,
  venue text not null, city text, capacity int not null default 50,
  fee_inr int not null default 0, image_url text,
  status text not null default 'draft' check (status in ('draft','published','cancelled','completed')),
  reminder_sent boolean not null default false,
  created_at timestamptz default now(),
  check (end_time > start_time));

create table registrations(
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  status text not null default 'confirmed' check (status in ('confirmed','pending','cancelled')),
  payment_status text not null default 'not_required' check (payment_status in ('not_required','pending','paid')),
  ticket_code text unique default ('EK-' || upper(substr(md5(random()::text),1,6))),
  created_at timestamptz default now(),
  unique (event_id, user_id));

create table event_media(
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events on delete cascade,
  url text not null, kind text not null check (kind in ('photo','video')),
  created_at timestamptz default now());

-- profile is created from the signup form, so members never re-enter details
create function handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into profiles(id,full_name,phone,college,city)
  values(new.id, coalesce(new.raw_user_meta_data->>'full_name',''), coalesce(new.raw_user_meta_data->>'phone',''),
         new.raw_user_meta_data->>'college', new.raw_user_meta_data->>'city');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

create function is_admin() returns boolean language sql stable security definer set search_path=public as
$$ select exists(select 1 from profiles where id=auth.uid() and role='admin') $$;

-- one tap registration: uses the logged in profile, checks seats, no form
create function register_for_event(p_event uuid) returns registrations language plpgsql security definer set search_path=public as $$
declare ev events; r registrations; taken int;
begin
  if auth.uid() is null then raise exception 'Please log in first'; end if;
  select * into ev from events where id=p_event and status='published' for update;
  if not found then raise exception 'Event is not open for registration'; end if;
  select count(*) into taken from registrations where event_id=p_event and status<>'cancelled';
  if taken >= ev.capacity then raise exception 'Event is full'; end if;
  insert into registrations(event_id,user_id,status,payment_status)
  values(p_event,auth.uid(),case when ev.fee_inr>0 then 'pending' else 'confirmed' end,
         case when ev.fee_inr>0 then 'pending' else 'not_required' end)
  on conflict (event_id,user_id) do update set status=excluded.status, payment_status=excluded.payment_status
    where registrations.status='cancelled'
  returning * into r;
  if r.id is null then raise exception 'You are already registered'; end if;
  return r;
end $$;

create function cancel_registration(p_reg uuid) returns void language sql security definer set search_path=public as
$$ update registrations set status='cancelled' where id=p_reg and user_id=auth.uid() $$;

alter table profiles enable row level security;
alter table events enable row level security;
alter table registrations enable row level security;
alter table event_media enable row level security;

create policy "own profile" on profiles for select using (id=auth.uid() or is_admin());
create policy "edit own profile" on profiles for update using (id=auth.uid());
revoke update on profiles from authenticated;
grant update(full_name,phone,college,city) on profiles to authenticated;

create policy "public events" on events for select using (status in ('published','completed') or is_admin());
create policy "admin events" on events for all using (is_admin()) with check (is_admin());

create policy "own registrations" on registrations for select using (user_id=auth.uid() or is_admin());
create policy "admin registrations" on registrations for update using (is_admin());

create policy "public media" on event_media for select using (true);
create policy "admin media" on event_media for all using (is_admin()) with check (is_admin());

insert into storage.buckets(id,name,public) values('event-media','event-media',true) on conflict do nothing;
create policy "admin uploads" on storage.objects for insert with check (bucket_id='event-media' and is_admin());

-- After you sign up on the site, make yourself admin:
-- update profiles set role='admin' where id=(select id from auth.users where email='YOUR_EMAIL');
