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

create index if not exists analytics_events_created_at_idx
on public.analytics_events(created_at desc);

create index if not exists analytics_events_place_id_created_at_idx
on public.analytics_events(place_id, created_at desc);

create index if not exists analytics_events_section_created_at_idx
on public.analytics_events(section, created_at desc);

create or replace function public.can_view_place_type(target_place_type text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    target_place_type <> 'wild-camping'
    or exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and (profiles.role = 'creator' or profiles.wild_camping_access = true)
    );
$$;

create or replace function public.get_visible_places_map(limit_count integer default 250)
returns table (
  id uuid,
  title text,
  location_name text,
  lat numeric,
  lng numeric,
  place_type text,
  tags text[],
  created_at timestamptz,
  created_by uuid,
  recommend_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  with access as (
    select exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and (profiles.role = 'creator' or profiles.wild_camping_access = true)
    ) as can_view_wild
  )
  select
    places.id,
    places.title,
    places.location_name,
    places.lat,
    places.lng,
    places.place_type,
    places.tags,
    places.created_at,
    places.created_by,
    places.recommend_count
  from public.places
  cross join access
  where places.place_type <> 'wild-camping'
    or access.can_view_wild
  order by places.created_at desc
  limit greatest(1, least(coalesce(limit_count, 250), 500));
$$;

create or replace function public.get_place_category_summaries(target_place_ids uuid[])
returns table (
  id uuid,
  place_id uuid,
  key text,
  heading text
)
language sql
stable
security definer
set search_path = public
as $$
  with access as (
    select exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and (profiles.role = 'creator' or profiles.wild_camping_access = true)
    ) as can_view_wild
  )
  select
    place_categories.id,
    place_categories.place_id,
    place_categories.key,
    place_categories.heading
  from public.place_categories
  join public.places on places.id = place_categories.place_id
  cross join access
  where place_categories.place_id = any(coalesce(target_place_ids, '{}'::uuid[]))
    and (places.place_type <> 'wild-camping' or access.can_view_wild)
  order by
    array_position(coalesce(target_place_ids, '{}'::uuid[]), place_categories.place_id),
    case place_categories.key
      when 'campsite' then 0
      when 'accommodation' then 1
      else 2
    end,
    place_categories.heading;
$$;

create or replace function public.get_place_previews(target_place_ids uuid[])
returns table (
  id uuid,
  place_id uuid,
  key text,
  heading text,
  description text,
  heading_photo_name text,
  heading_photo_url text,
  heading_photo_thumb_url text
)
language sql
stable
security definer
set search_path = public
as $$
  with access as (
    select exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and (profiles.role = 'creator' or profiles.wild_camping_access = true)
    ) as can_view_wild
  )
  select
    place_categories.id,
    place_categories.place_id,
    place_categories.key,
    place_categories.heading,
    place_categories.description,
    place_categories.heading_photo_name,
    place_categories.heading_photo_url,
    place_categories.heading_photo_thumb_url
  from public.place_categories
  join public.places on places.id = place_categories.place_id
  cross join access
  where place_categories.place_id = any(coalesce(target_place_ids, '{}'::uuid[]))
    and place_categories.key in ('campsite', 'accommodation')
    and (places.place_type <> 'wild-camping' or access.can_view_wild)
  order by
    array_position(coalesce(target_place_ids, '{}'::uuid[]), place_categories.place_id),
    case place_categories.key
      when 'campsite' then 0
      when 'accommodation' then 1
      else 2
    end;
$$;

create or replace function public.get_place_detail(target_place_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with access as (
    select exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and (profiles.role = 'creator' or profiles.wild_camping_access = true)
    ) as can_view_wild
  )
  select jsonb_build_object(
    'id', places.id,
    'title', places.title,
    'location_name', places.location_name,
    'lat', places.lat,
    'lng', places.lng,
    'place_type', places.place_type,
    'contact_email', places.contact_email,
    'tags', places.tags,
    'about', places.about,
    'need_to_knows', places.need_to_knows,
    'created_at', places.created_at,
    'created_by', places.created_by,
    'recommend_count', places.recommend_count,
    'place_categories', coalesce(categories.rows, '[]'::jsonb),
    'place_comments', '[]'::jsonb
  )
  from public.places
  cross join access
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', place_categories.id,
        'place_id', place_categories.place_id,
        'key', place_categories.key,
        'heading', place_categories.heading,
        'description', place_categories.description,
        'heading_photo_name', place_categories.heading_photo_name,
        'heading_photo_url', place_categories.heading_photo_url,
        'heading_photo_thumb_url', place_categories.heading_photo_thumb_url,
        'gallery', '[]'::jsonb,
        'strava', null
      )
      order by
        case place_categories.key
          when 'campsite' then 0
          when 'accommodation' then 1
          else 2
        end,
        place_categories.heading
    ) as rows
    from public.place_categories
    where place_categories.place_id = places.id
  ) categories on true
  where places.id = target_place_id
    and (places.place_type <> 'wild-camping' or access.can_view_wild);
$$;

create or replace function public.get_place_category_extras(target_place_id uuid)
returns table (
  id uuid,
  place_id uuid,
  key text,
  heading text,
  description text,
  heading_photo_name text,
  heading_photo_url text,
  heading_photo_thumb_url text,
  gallery jsonb,
  strava jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with access as (
    select exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and (profiles.role = 'creator' or profiles.wild_camping_access = true)
    ) as can_view_wild
  )
  select
    place_categories.id,
    place_categories.place_id,
    place_categories.key,
    place_categories.heading,
    place_categories.description,
    place_categories.heading_photo_name,
    place_categories.heading_photo_url,
    place_categories.heading_photo_thumb_url,
    place_categories.gallery,
    place_categories.strava
  from public.place_categories
  join public.places on places.id = place_categories.place_id
  cross join access
  where place_categories.place_id = target_place_id
    and (places.place_type <> 'wild-camping' or access.can_view_wild)
  order by
    case place_categories.key
      when 'campsite' then 0
      when 'accommodation' then 1
      else 2
    end,
    place_categories.heading;
$$;

create or replace function public.get_place_comments(target_place_id uuid)
returns table (
  id uuid,
  name text,
  email text,
  message text,
  created_at timestamptz,
  avatar_url text
)
language sql
stable
security definer
set search_path = public
as $$
  with access as (
    select exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and (profiles.role = 'creator' or profiles.wild_camping_access = true)
    ) as can_view_wild
  )
  select
    place_comments.id,
    place_comments.name,
    place_comments.email,
    place_comments.message,
    place_comments.created_at,
    place_comments.avatar_url
  from public.place_comments
  join public.places on places.id = place_comments.place_id
  cross join access
  where place_comments.place_id = target_place_id
    and (places.place_type <> 'wild-camping' or access.can_view_wild)
  order by place_comments.created_at asc
  limit 100;
$$;

create or replace function public.get_creator_analytics()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'creator'
  ) then
    raise exception 'Creator access required.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'totalVisits', count(*) filter (where event_type = 'page_view'),
    'guestVisits', count(*) filter (where event_type = 'page_view' and visitor_role = 'guest'),
    'logins', count(*) filter (where event_type = 'login'),
    'eventViews', count(*) filter (where event_type = 'place_view'),
    'eventsCreated', count(*) filter (where event_type = 'place_created'),
    'photoUploads', coalesce(sum(photo_count), 0),
    'sectionViews', coalesce((
      select jsonb_object_agg(section, total)
      from (
        select section, count(*) as total
        from public.analytics_events
        where event_type = 'section_view'
          and section is not null
        group by section
      ) section_totals
    ), '{}'::jsonb),
    'placeViews', coalesce((
      select jsonb_object_agg(place_id::text, total)
      from (
        select place_id, count(*) as total
        from public.analytics_events
        where event_type = 'place_view'
          and place_id is not null
        group by place_id
      ) place_totals
    ), '{}'::jsonb),
    'dailySectionViews', coalesce((
      select jsonb_object_agg(section, days)
      from (
        select section, jsonb_object_agg(day, total order by day) as days
        from (
          select section, created_at::date::text as day, count(*) as total
          from public.analytics_events
          where event_type = 'section_view'
            and section is not null
          group by section, created_at::date
        ) daily_section_totals
        group by section
      ) section_days
    ), '{}'::jsonb),
    'dailyPlaceViews', coalesce((
      select jsonb_object_agg(place_id::text, days)
      from (
        select place_id, jsonb_object_agg(day, total order by day) as days
        from (
          select place_id, created_at::date::text as day, count(*) as total
          from public.analytics_events
          where event_type = 'place_view'
            and place_id is not null
          group by place_id, created_at::date
        ) daily_place_totals
        group by place_id
      ) place_days
    ), '{}'::jsonb),
    'activeDates', coalesce((
      select jsonb_agg(day order by day)
      from (
        select distinct created_at::date::text as day
        from public.analytics_events
        order by day
      ) active_days
    ), '[]'::jsonb)
  )
  into result
  from public.analytics_events;

  return result;
end;
$$;
