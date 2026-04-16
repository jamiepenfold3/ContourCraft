create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null,
  role text not null check (role in ('creator', 'viewer')) default 'viewer',
  wild_camping_access boolean not null default false,
  avatar_photo_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, email, full_name, role, wild_camping_access)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    'viewer',
    false
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = excluded.full_name;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create table if not exists public.places (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  location_name text not null,
  lat numeric not null,
  lng numeric not null,
  place_type text not null check (place_type in ('wild-camping', 'camping', 'non-camping')),
  contact_email text,
  tags text[] not null default '{}',
  about text not null,
  need_to_knows text not null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  recommend_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.place_categories (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places(id) on delete cascade,
  key text not null check (key in (
    'campsite',
    'accommodation',
    'trails',
    'trails_2',
    'eating_out',
    'eating_in',
    'wine_tasting',
    'beer_tasting',
    'swim'
  )),
  heading text not null,
  description text not null,
  heading_photo_name text,
  heading_photo_url text,
  gallery jsonb not null default '[]'::jsonb,
  strava jsonb
);

create table if not exists public.place_comments (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places(id) on delete cascade,
  name text not null,
  email text not null,
  message text not null,
  profile_id uuid references public.profiles(id) on delete set null,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  visitor_role text not null,
  place_id uuid references public.places(id) on delete set null,
  section text,
  photo_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.place_favourites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  place_id uuid not null references public.places(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, place_id)
);

create or replace function public.increment_place_recommendation(target_place_id uuid)
returns void
language sql
security definer
as $$
  update public.places
  set recommend_count = recommend_count + 1
  where id = target_place_id;
$$;

alter table public.profiles enable row level security;
alter table public.places enable row level security;
alter table public.place_categories enable row level security;
alter table public.place_comments enable row level security;
alter table public.analytics_events enable row level security;
alter table public.place_favourites enable row level security;

create index if not exists place_categories_place_id_idx
on public.place_categories(place_id);

create index if not exists place_categories_place_id_key_idx
on public.place_categories(place_id, key);

create index if not exists place_comments_place_id_idx
on public.place_comments(place_id);

create index if not exists place_comments_place_id_created_at_idx
on public.place_comments(place_id, created_at desc);

create index if not exists places_created_at_idx
on public.places(created_at desc);

create index if not exists places_public_created_at_idx
on public.places(created_at desc)
where place_type <> 'wild-camping';

create index if not exists places_created_by_idx
on public.places(created_by);

create index if not exists places_place_type_idx
on public.places(place_type);

create policy "profiles selectable by owner"
on public.profiles for select
to authenticated
using (auth.uid() = id);

create policy "profiles insertable by owner"
on public.profiles for insert
to authenticated
with check (auth.uid() = id);

create policy "profiles updatable by owner"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "public can view standard places"
on public.places for select
using (
  place_type <> 'wild-camping'
  or exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and (profiles.role = 'creator' or profiles.wild_camping_access = true)
  )
);

create policy "creators can insert places"
on public.places for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'creator'
  )
);

create policy "creators can update own places"
on public.places for update
to authenticated
using (
  created_by = auth.uid()
  and exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'creator'
  )
)
with check (
  created_by = auth.uid()
  and exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'creator'
  )
);

create policy "creators can delete own places"
on public.places for delete
to authenticated
using (
  created_by = auth.uid()
  and exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'creator'
  )
);

create policy "public can view categories for visible places"
on public.place_categories for select
using (true);

create policy "creators can insert categories"
on public.place_categories for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'creator'
  )
);

create policy "creators can delete categories for own places"
on public.place_categories for delete
to authenticated
using (
  exists (
    select 1
    from public.places
    join public.profiles on profiles.id = auth.uid()
    where places.id = place_categories.place_id
      and places.created_by = auth.uid()
      and profiles.role = 'creator'
  )
);

alter table if exists public.place_categories
  drop constraint if exists place_categories_key_check;

update public.place_categories
set key = 'wine_tasting'
where key = 'wineries';

update public.place_categories
set key = 'eating_out'
where key = 'food';

with legacy_strava as (
  select id, place_id, strava
  from public.place_categories
  where key = 'strava'
),
target_trails as (
  select distinct on (legacy_strava.id)
    legacy_strava.id as strava_id,
    place_categories.id as trail_id,
    legacy_strava.strava
  from legacy_strava
  join public.place_categories
    on place_categories.place_id = legacy_strava.place_id
   and place_categories.key in ('trails', 'trails_2')
  order by
    legacy_strava.id,
    case place_categories.key when 'trails' then 0 else 1 end
)
update public.place_categories
set strava = coalesce(public.place_categories.strava, target_trails.strava)
from target_trails
where public.place_categories.id = target_trails.trail_id;

with legacy_strava as (
  select id, place_id
  from public.place_categories
  where key = 'strava'
),
target_trails as (
  select distinct on (legacy_strava.id)
    legacy_strava.id as strava_id
  from legacy_strava
  join public.place_categories
    on place_categories.place_id = legacy_strava.place_id
   and place_categories.key in ('trails', 'trails_2')
  order by
    legacy_strava.id,
    case place_categories.key when 'trails' then 0 else 1 end
)
delete from public.place_categories
using target_trails
where public.place_categories.id = target_trails.strava_id;

update public.place_categories
set key = 'trails'
where key = 'strava';

alter table if exists public.place_categories
  add constraint place_categories_key_check
  check (key in (
    'campsite',
    'accommodation',
    'trails',
    'trails_2',
    'eating_out',
    'eating_in',
    'wine_tasting',
    'beer_tasting',
    'swim'
  ));

alter table if exists public.place_categories
  alter column heading_photo_name drop not null,
  alter column heading_photo_url drop not null;

create policy "public can view comments"
on public.place_comments for select
using (true);

create policy "public can insert comments"
on public.place_comments for insert
with check (
  exists (
    select 1
    from public.places
    where places.id = place_comments.place_id
  )
);

create policy "public can insert analytics"
on public.analytics_events for insert
with check (true);

create policy "creators can read analytics"
on public.analytics_events for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'creator'
  )
);

create policy "users can view own favourites"
on public.place_favourites for select
to authenticated
using (auth.uid() = user_id);

create policy "users can insert own favourites"
on public.place_favourites for insert
to authenticated
with check (auth.uid() = user_id);

create policy "users can delete own favourites"
on public.place_favourites for delete
to authenticated
using (auth.uid() = user_id);

create table if not exists public.newsletter_subscribers (
  email text primary key,
  full_name text not null,
  source text not null,
  created_at timestamptz not null default now()
);

alter table public.newsletter_subscribers enable row level security;

create policy "public can add newsletter subscribers"
on public.newsletter_subscribers for insert
with check (true);

create table if not exists public.place_recommendations (
  place_id uuid not null references public.places(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  primary key (place_id, email)
);

alter table public.place_recommendations enable row level security;

create or replace function public.recommend_place_once(
  target_place_id uuid,
  recommender_email text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(trim(recommender_email));
  next_count integer;
begin
  if normalized_email = '' then
    raise exception 'Email is required to recommend.' using errcode = '22023';
  end if;

  insert into public.place_recommendations (place_id, email)
  values (target_place_id, normalized_email);

  update public.places
  set recommend_count = recommend_count + 1
  where id = target_place_id
  returning recommend_count into next_count;

  return next_count;
exception
  when unique_violation then
    raise exception 'You have already recommended this place.' using errcode = '23505';
end;
$$;
