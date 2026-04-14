import { Session } from "@supabase/supabase-js";
import {
  AdventureEvent,
  AnalyticsSnapshot,
  AppProfile,
  EventComment,
  LocationCategory,
  PlaceType,
} from "../types";
import { initialAnalytics } from "../data/sampleData";
import { supabase } from "./supabase";

type PlaceInsert = Omit<AdventureEvent, "id" | "createdAt" | "createdBy" | "createdById" | "comments"> & {
  createdByName: string;
};

const INITIAL_PLACE_LIMIT = 250;

const ensureClient = () => {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }
  return supabase;
};

const getAuthRedirectTo = () => {
  const configuredRedirect = import.meta.env.VITE_AUTH_REDIRECT_URL?.trim();
  if (configuredRedirect) {
    return configuredRedirect;
  }

  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return undefined;
  }

  return window.location.origin;
};

const mapProfile = (row: any): AppProfile => ({
  id: row.id,
  email: row.email ?? "",
  fullName: row.full_name ?? "Unknown",
  role: row.role,
  wildCampingAccess: Boolean(row.wild_camping_access),
});

const mapCategory = (row: any): LocationCategory => ({
  key: row.key,
  heading: row.heading,
  description: row.description,
  headingPhoto: row.heading_photo_url
    ? {
        id: `${row.id}-heading`,
        name: row.heading_photo_name ?? row.heading,
        url: row.heading_photo_url,
      }
    : undefined,
  gallery: Array.isArray(row.gallery) ? row.gallery : [],
  strava: row.strava ?? undefined,
});

const mapComment = (row: any): EventComment => ({
  id: row.id,
  name: row.name,
  email: row.email,
  message: row.message,
  createdAt: row.created_at.slice(0, 10),
});

const mapPlace = (row: any): AdventureEvent => ({
  id: row.id,
  title: row.title,
  locationName: row.location_name,
  lat: Number(row.lat),
  lng: Number(row.lng),
  placeType: row.place_type as PlaceType,
  contactEmail: row.contact_email ?? "",
  tags: row.tags ?? [],
  about: row.about ?? "",
  needToKnows: row.need_to_knows ?? "",
  createdById: row.created_by,
  createdBy: row.created_by_name ?? "ContourCraft",
  createdAt: row.created_at.slice(0, 10),
  recommendCount: row.recommend_count ?? 0,
  comments: (row.place_comments ?? []).map(mapComment),
  categories: (row.place_categories ?? []).map(mapCategory),
});

export async function getSession() {
  const client = ensureClient();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session;
}

export function onAuthStateChange(callback: (session: Session | null) => void) {
  const client = ensureClient();
  return client.auth.onAuthStateChange((_event, session) => callback(session));
}

export async function getProfile(userId: string) {
  const client = ensureClient();
  const { data, error } = await client
    .from("profiles")
    .select("id, email, full_name, role, wild_camping_access")
    .eq("id", userId)
    .single();

  if (error) throw error;
  return mapProfile(data);
}

export async function signIn(email: string, password: string) {
  const client = ensureClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUpViewer(
  fullName: string,
  email: string,
  password: string,
) {
  const client = ensureClient();
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: getAuthRedirectTo(),
      data: {
        full_name: fullName,
        role: "viewer",
      },
    },
  });
  if (error) throw error;

  if (data.user) {
    const { error: profileError } = await client.from("profiles").upsert({
      id: data.user.id,
      email,
      full_name: fullName,
      role: "viewer",
      wild_camping_access: false,
    });
    if (profileError) throw profileError;
  }

  return {
    requiresEmailConfirmation: !data.session,
  };
}

export async function addNewsletterSubscriber(
  fullName: string,
  email: string,
  source: "signup" | "comment",
) {
  const client = ensureClient();
  const { error } = await client.from("newsletter_subscribers").insert({
    full_name: fullName,
    email,
    source,
  });

  if (error && error.code !== "23505") {
    throw error;
  }
}

export async function signOut() {
  const client = ensureClient();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function fetchPlaces() {
  const client = ensureClient();
  const { data: placeRows, error } = await client
    .from("places")
    .select(
      `
        id,
        title,
        location_name,
        lat,
        lng,
        place_type,
        tags,
        created_at,
        created_by,
        recommend_count
      `,
    )
    .order("created_at", { ascending: false })
    .limit(INITIAL_PLACE_LIMIT);

  if (error) throw error;

  return (placeRows ?? []).map((place) =>
    mapPlace({
      ...place,
      place_categories: [],
      place_comments: [],
    }),
  );
}

export async function fetchPlacePreviewCategories(placeIds: string[]) {
  if (!placeIds.length) {
    return [];
  }

  const client = ensureClient();
  const { data: categoryRows, error: categoryError } = await client
    .from("place_categories")
    .select(
      `
        id,
        place_id,
        key,
        heading,
        description,
        heading_photo_name,
        heading_photo_url
      `,
    )
    .in("place_id", placeIds)
    .in("key", ["campsite", "accommodation"]);

  if (categoryError) throw categoryError;
  return categoryRows ?? [];
}

export async function fetchPlaceDetails(placeId: string) {
  const client = ensureClient();
  const [
    { data: placeRow, error: placeError },
    { data: categoryRows, error: categoryError },
    { data: commentRows, error: commentError },
  ] = await Promise.all([
    client
      .from("places")
      .select(
        `
          id,
          title,
          location_name,
          lat,
          lng,
          place_type,
          contact_email,
          tags,
          about,
          need_to_knows,
          created_at,
          created_by,
          recommend_count
        `,
      )
      .eq("id", placeId)
      .single(),
    client
      .from("place_categories")
      .select(
        `
          id,
          place_id,
          key,
          heading,
          description,
          heading_photo_name,
          heading_photo_url,
          gallery,
          strava
        `,
      )
      .eq("place_id", placeId),
    client
      .from("place_comments")
      .select("id, name, email, message, created_at")
      .eq("place_id", placeId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (placeError) throw placeError;
  if (categoryError) throw categoryError;
  if (commentError) throw commentError;

  return mapPlace({
    ...placeRow,
    place_categories: categoryRows ?? [],
    place_comments: (commentRows ?? []).reverse(),
  });
}

export async function createPlace(userId: string, place: PlaceInsert) {
  const client = ensureClient();
  const { data: placeRow, error: placeError } = await client
    .from("places")
    .insert({
      title: place.title,
      location_name: place.locationName,
      lat: place.lat,
      lng: place.lng,
      place_type: place.placeType,
      contact_email: place.contactEmail,
      tags: place.tags,
      about: place.about,
      need_to_knows: place.needToKnows,
      created_by: userId,
    })
    .select("id")
    .single();

  if (placeError) throw placeError;

  const categoryRows = place.categories.map((category) => ({
    place_id: placeRow.id,
    key: category.key,
    heading: category.heading,
    description: category.description,
    heading_photo_name: category.headingPhoto?.name ?? null,
    heading_photo_url: category.headingPhoto?.url ?? null,
    gallery: category.gallery,
    strava: category.strava ?? null,
  }));

  if (categoryRows.length) {
    const { error: categoryError } = await client
      .from("place_categories")
      .insert(categoryRows);
    if (categoryError) throw categoryError;
  }

  return {
    ...place,
    id: placeRow.id,
    createdBy: place.createdByName,
    createdById: userId,
    createdAt: new Date().toISOString().slice(0, 10),
    comments: [],
  } as AdventureEvent;
}

export async function updatePlace(
  userId: string,
  placeId: string,
  place: PlaceInsert,
) {
  const client = ensureClient();
  const { error: placeError } = await client
    .from("places")
    .update({
      title: place.title,
      location_name: place.locationName,
      lat: place.lat,
      lng: place.lng,
      place_type: place.placeType,
      contact_email: place.contactEmail,
      tags: place.tags,
      about: place.about,
      need_to_knows: place.needToKnows,
    })
    .eq("id", placeId)
    .eq("created_by", userId);

  if (placeError) throw placeError;

  const { error: deleteCategoriesError } = await client
    .from("place_categories")
    .delete()
    .eq("place_id", placeId);
  if (deleteCategoriesError) throw deleteCategoriesError;

  const categoryRows = place.categories.map((category) => ({
    place_id: placeId,
    key: category.key,
    heading: category.heading,
    description: category.description,
    heading_photo_name: category.headingPhoto?.name ?? null,
    heading_photo_url: category.headingPhoto?.url ?? null,
    gallery: category.gallery,
    strava: category.strava ?? null,
  }));

  if (categoryRows.length) {
    const { error: categoryError } = await client
      .from("place_categories")
      .insert(categoryRows);
    if (categoryError) throw categoryError;
  }

  return {
    ...place,
    id: placeId,
    createdBy: place.createdByName,
    createdById: userId,
    createdAt: new Date().toISOString().slice(0, 10),
    comments: [],
  } as AdventureEvent;
}

export async function deletePlace(userId: string, placeId: string) {
  const client = ensureClient();
  const { error } = await client
    .from("places")
    .delete()
    .eq("id", placeId)
    .eq("created_by", userId);
  if (error) throw error;
}

export async function fetchFavouritePlaceIds(userId: string) {
  const client = ensureClient();
  const { data, error } = await client
    .from("place_favourites")
    .select("place_id")
    .eq("user_id", userId);

  if (error) throw error;
  return (data ?? []).map((row) => row.place_id as string);
}

export async function addFavourite(userId: string, placeId: string) {
  const client = ensureClient();
  const { error } = await client
    .from("place_favourites")
    .insert({ user_id: userId, place_id: placeId });
  if (error) throw error;
}

export async function removeFavourite(userId: string, placeId: string) {
  const client = ensureClient();
  const { error } = await client
    .from("place_favourites")
    .delete()
    .eq("user_id", userId)
    .eq("place_id", placeId);
  if (error) throw error;
}

export async function addComment(
  placeId: string,
  comment: { name: string; email: string; message: string },
) {
  const client = ensureClient();
  const { data, error } = await client
    .from("place_comments")
    .insert({
      place_id: placeId,
      name: comment.name,
      email: comment.email,
      message: comment.message,
    })
    .select("*")
    .single();

  if (error) throw error;
  return mapComment(data);
}

export async function recommendPlace(placeId: string, email: string) {
  const client = ensureClient();
  const { data, error } = await client.rpc("recommend_place_once", {
    target_place_id: placeId,
    recommender_email: email,
  });
  if (error) {
    if (error.code === "23505") {
      throw new Error("You have already recommended this place.");
    }
    throw error;
  }
  return Number(data);
}

export async function trackEvent(input: {
  eventType: string;
  visitorRole: string;
  placeId?: string | null;
  section?: string | null;
  photoCount?: number;
}) {
  const client = ensureClient();
  const { error } = await client.from("analytics_events").insert({
    event_type: input.eventType,
    visitor_role: input.visitorRole,
    place_id: input.placeId ?? null,
    section: input.section ?? null,
    photo_count: input.photoCount ?? 0,
  });
  if (error) throw error;
}

export async function fetchAnalytics() {
  const client = ensureClient();
  const { data, error } = await client
    .from("analytics_events")
    .select("event_type, visitor_role, section, photo_count, created_at");

  if (error) throw error;

  const rows = (data ?? []) as Array<{
    event_type: string;
    visitor_role: string;
    section: string | null;
    photo_count: number | null;
    created_at: string;
  }>;

  return rows.reduce<AnalyticsSnapshot>((snapshot, row) => {
    snapshot.totalVisits += row.event_type === "page_view" ? 1 : 0;
    snapshot.guestVisits +=
      row.event_type === "page_view" && row.visitor_role === "guest" ? 1 : 0;
    snapshot.logins += row.event_type === "login" ? 1 : 0;
    snapshot.eventViews += row.event_type === "place_view" ? 1 : 0;
    snapshot.eventsCreated += row.event_type === "place_created" ? 1 : 0;
    snapshot.photoUploads += row.photo_count ?? 0;
    if (row.section) {
      snapshot.sectionViews[row.section] =
        (snapshot.sectionViews[row.section] ?? 0) + 1;
    }
    const day = row.created_at.slice(0, 10);
    if (!snapshot.activeDates.includes(day)) {
      snapshot.activeDates.push(day);
    }
    return snapshot;
  }, {
    ...initialAnalytics,
    sectionViews: { ...initialAnalytics.sectionViews },
    activeDates: [],
  });
}
