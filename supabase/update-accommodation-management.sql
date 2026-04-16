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

alter table if exists public.place_categories
  add column if not exists heading_photo_thumb_url text;

alter table if exists public.places
  add column if not exists contact_email text;

alter table if exists public.profiles
  add column if not exists avatar_photo_name text,
  add column if not exists avatar_url text,
  add column if not exists avatar_thumb_url text;

alter table if exists public.place_comments
  add column if not exists profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists avatar_url text;

create table if not exists public.place_favourites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  place_id uuid not null references public.places(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, place_id)
);

alter table public.place_favourites enable row level security;

drop policy if exists "users can view own favourites" on public.place_favourites;
create policy "users can view own favourites"
on public.place_favourites for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "users can insert own favourites" on public.place_favourites;
create policy "users can insert own favourites"
on public.place_favourites for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "users can delete own favourites" on public.place_favourites;
create policy "users can delete own favourites"
on public.place_favourites for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "creators can update own places" on public.places;
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

drop policy if exists "creators can delete own places" on public.places;
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

drop policy if exists "creators can delete categories for own places" on public.place_categories;
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

drop policy if exists "public can view categories for visible places" on public.place_categories;
drop policy if exists "public can view categories" on public.place_categories;
create policy "public can view categories"
on public.place_categories for select
using (true);

drop policy if exists "public can view comments" on public.place_comments;
create policy "public can view comments"
on public.place_comments for select
using (true);

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

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'place-photos',
  'place-photos',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public can view place photos" on storage.objects;
create policy "public can view place photos"
on storage.objects for select
using (bucket_id = 'place-photos');

drop policy if exists "authenticated users can upload place photos" on storage.objects;
create policy "authenticated users can upload place photos"
on storage.objects for insert
to authenticated
with check (bucket_id = 'place-photos');

drop policy if exists "authenticated users can update place photos" on storage.objects;
create policy "authenticated users can update place photos"
on storage.objects for update
to authenticated
using (bucket_id = 'place-photos')
with check (bucket_id = 'place-photos');

drop policy if exists "authenticated users can delete place photos" on storage.objects;
create policy "authenticated users can delete place photos"
on storage.objects for delete
to authenticated
using (bucket_id = 'place-photos');

create table if not exists public.newsletter_subscribers (
  email text primary key,
  full_name text not null,
  source text not null,
  created_at timestamptz not null default now()
);

alter table public.newsletter_subscribers enable row level security;

drop policy if exists "public can add newsletter subscribers" on public.newsletter_subscribers;
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
