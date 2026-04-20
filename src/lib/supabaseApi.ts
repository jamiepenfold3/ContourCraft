import { Session } from "@supabase/supabase-js";
import {
  AdventureEvent,
  AnalyticsSnapshot,
  AppProfile,
  EventComment,
  CategoryKey,
  LocationCategory,
  PhotoAsset,
  PlaceType,
} from "../types";
import { initialAnalytics } from "../data/sampleData";
import { supabase } from "./supabase";

type PlaceInsert = Omit<AdventureEvent, "id" | "createdAt" | "createdBy" | "createdById" | "comments"> & {
  createdByName: string;
};

const INITIAL_PLACE_LIMIT = 250;
const PHOTO_BUCKET = "place-photos";
const useOptimizedRpc = import.meta.env.VITE_USE_OPTIMIZED_RPC === "true";
const ensureClient = () => {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }
  return supabase;
};

const isMissingRpcError = (error: unknown) => {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { code?: string; message?: string };
  return (
    maybeError.code === "PGRST202" ||
    maybeError.code === "42883" ||
    (maybeError.message ?? "").toLowerCase().includes("function")
  );
};

const isDataUrl = (value: string) => value.startsWith("data:");

const safeFileName = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "photo";

const dataUrlToBlob = async (dataUrl: string) => {
  const response = await fetch(dataUrl);
  return response.blob();
};

const getPublicStorageUrl = (path: string, transform?: { width: number; quality: number }) => {
  const client = ensureClient();
  const { data } = client.storage.from(PHOTO_BUCKET).getPublicUrl(
    path,
    transform
      ? {
          transform: {
            width: transform.width,
            quality: transform.quality,
          },
        }
      : undefined,
  );
  return data.publicUrl;
};

const uploadPhotoAsset = async (
  asset: PhotoAsset | undefined,
  pathPrefix: string,
  thumbWidth: number,
) => {
  if (!asset || !isDataUrl(asset.url)) {
    return asset;
  }

  const client = ensureClient();
  const blob = await dataUrlToBlob(asset.url);
  const path = `${pathPrefix}/${crypto.randomUUID()}-${safeFileName(asset.name)}`;
  const { error } = await client.storage.from(PHOTO_BUCKET).upload(path, blob, {
    cacheControl: "31536000",
    contentType: blob.type || "image/jpeg",
    upsert: true,
  });
  if (error) throw error;

  return {
    ...asset,
    id: path,
    url: getPublicStorageUrl(path),
    thumbUrl: getPublicStorageUrl(path, { width: thumbWidth, quality: 70 }),
    storagePath: path,
  };
};

const uploadPhotoAssets = async (
  assets: PhotoAsset[],
  pathPrefix: string,
  thumbWidth: number,
) =>
  Promise.all(
    assets.map((asset) => uploadPhotoAsset(asset, pathPrefix, thumbWidth) as Promise<PhotoAsset>),
  );

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

const normalizeCategoryKey = (key: string): CategoryKey => {
  if (key === "food") return "eating_out";
  if (key === "wineries") return "wine_tasting";
  return key as CategoryKey;
};

const mapProfile = (row: any): AppProfile => ({
  id: row.id,
  email: row.email ?? "",
  fullName: row.full_name ?? "Unknown",
  role: row.role,
  wildCampingAccess: Boolean(row.wild_camping_access),
  avatarPhotoName: row.avatar_photo_name ?? undefined,
  avatarUrl: row.avatar_thumb_url ?? row.avatar_url ?? undefined,
});

const mapCategory = (row: any): LocationCategory => ({
  key: normalizeCategoryKey(row.key),
  heading: row.heading,
  description: row.description ?? "",
  headingPhoto: row.heading_photo_url
    ? {
        id: `${row.id}-heading`,
        name: row.heading_photo_name ?? row.heading,
        url: row.heading_photo_url,
        thumbUrl: row.heading_photo_thumb_url ?? undefined,
      }
    : undefined,
  gallery: Array.isArray(row.gallery) ? row.gallery : [],
  strava: row.strava ?? undefined,
});

const normalizePlaceCategories = (rows: any[]): LocationCategory[] => {
  const categories = rows.map(mapCategory);
  const legacyStrava = categories.find(
    (category) => category.key === "strava" && category.strava,
  )?.strava;
  const visibleCategories = categories.filter((category) => category.key !== "strava");

  if (!legacyStrava) {
    return visibleCategories;
  }

  const trailIndex = visibleCategories.findIndex(
    (category) => category.key === "trails" || category.key === "trails_2",
  );
  if (trailIndex === -1 || visibleCategories[trailIndex].strava) {
    return visibleCategories;
  }

  return visibleCategories.map((category, index) =>
    index === trailIndex ? { ...category, strava: legacyStrava } : category,
  );
};

const uploadCategoryPhotos = async (placeId: string, categories: LocationCategory[]) =>
  Promise.all(
    categories.map(async (category) => {
      const categoryPrefix = `places/${placeId}/${category.key}`;
      const [headingPhoto, gallery] = await Promise.all([
        uploadPhotoAsset(category.headingPhoto, `${categoryPrefix}/heading`, 720),
        uploadPhotoAssets(category.gallery, `${categoryPrefix}/gallery`, 480),
      ]);

      return {
        ...category,
        headingPhoto,
        gallery,
      };
    }),
  );

const categoryToRow = (placeId: string, category: LocationCategory) => ({
  place_id: placeId,
  key: category.key,
  heading: category.heading,
  description: category.description,
  heading_photo_name: category.headingPhoto?.name ?? null,
  heading_photo_url: category.headingPhoto?.url ?? null,
  heading_photo_thumb_url: category.headingPhoto?.thumbUrl ?? category.headingPhoto?.url ?? null,
  gallery: category.gallery,
  strava: category.strava ?? null,
});

const mapComment = (row: any): EventComment => ({
  id: row.id,
  name: row.name,
  email: row.email,
  message: row.message,
  createdAt: row.created_at.slice(0, 10),
  avatarUrl: row.avatar_url ?? undefined,
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
  categories: normalizePlaceCategories(row.place_categories ?? []),
});

const mapAnalyticsSnapshot = (row: Partial<AnalyticsSnapshot> | null | undefined): AnalyticsSnapshot => ({
  ...initialAnalytics,
  ...row,
  sectionViews: {
    ...initialAnalytics.sectionViews,
    ...(row?.sectionViews ?? {}),
  },
  placeViews: row?.placeViews ?? {},
  dailySectionViews: row?.dailySectionViews ?? {},
  dailyPlaceViews: row?.dailyPlaceViews ?? {},
  activeDates: row?.activeDates ?? [],
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
    .select("id, email, full_name, role, wild_camping_access, avatar_photo_name, avatar_url, avatar_thumb_url")
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
      avatar_photo_name: null,
      avatar_url: null,
      avatar_thumb_url: null,
    });
    if (profileError) throw profileError;
  }

  return {
    requiresEmailConfirmation: !data.session,
  };
}

export async function updateProfilePhoto(
  userId: string,
  photo: { name: string; url: string } | null,
) {
  const client = ensureClient();
  const uploadedPhoto = photo
    ? await uploadPhotoAsset(
        {
          id: `${userId}-avatar`,
          name: photo.name,
          url: photo.url,
        },
        `profiles/${userId}`,
        160,
      )
    : null;
  const { data, error } = await client
    .from("profiles")
    .update({
      avatar_photo_name: uploadedPhoto?.name ?? null,
      avatar_url: uploadedPhoto?.url ?? null,
      avatar_thumb_url: uploadedPhoto?.thumbUrl ?? null,
    })
    .eq("id", userId)
    .select("id, email, full_name, role, wild_camping_access, avatar_photo_name, avatar_url, avatar_thumb_url")
    .single();

  if (error) throw error;
  return mapProfile(data);
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
  if (useOptimizedRpc) {
    const { data: rpcRows, error: rpcError } = await client.rpc("get_visible_places_map", {
      limit_count: INITIAL_PLACE_LIMIT,
    });

    if (!rpcError) {
      return (rpcRows ?? []).map((place: any) =>
        mapPlace({
          ...place,
          place_categories: [],
          place_comments: [],
        }),
      );
    }
    if (!isMissingRpcError(rpcError)) throw rpcError;
  }

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

export async function fetchPlaceCategorySummaries(placeIds: string[]) {
  if (!placeIds.length) {
    return [];
  }

  const client = ensureClient();
  if (useOptimizedRpc) {
    const { data: rpcRows, error: rpcError } = await client.rpc(
      "get_place_category_summaries",
      {
        target_place_ids: placeIds,
      },
    );

    if (!rpcError) {
      return (rpcRows ?? []).map((category: any) => ({
        ...category,
        key: normalizeCategoryKey(category.key),
      }));
    }
    if (!isMissingRpcError(rpcError)) throw rpcError;
  }

  const { data: categoryRows, error } = await client
    .from("place_categories")
    .select("id, place_id, key, heading")
    .in("place_id", placeIds);

  if (error) throw error;
  return (categoryRows ?? []).map((category) => ({
    ...category,
    key: normalizeCategoryKey(category.key),
  }));
}

export async function fetchPlacePreviewCategories(placeIds: string[]) {
  if (!placeIds.length) {
    return [];
  }

  const client = ensureClient();
  if (useOptimizedRpc) {
    const { data: rpcRows, error: rpcError } = await client.rpc("get_place_previews", {
      target_place_ids: placeIds,
    });

    if (!rpcError) {
      return (rpcRows ?? []).map((category: any) => ({
        ...category,
        key: normalizeCategoryKey(category.key),
      }));
    }
    if (!isMissingRpcError(rpcError)) throw rpcError;
  }

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
          heading_photo_url,
          heading_photo_thumb_url
      `,
    )
    .in("place_id", placeIds)
    .in("key", ["campsite", "accommodation"]);

  if (categoryError) throw categoryError;
  return (categoryRows ?? []).map((category) => ({
    ...category,
    key: normalizeCategoryKey(category.key),
  }));
}

export async function fetchPlaceDetails(placeId: string) {
  const client = ensureClient();
  if (useOptimizedRpc) {
    const { data: rpcPlace, error: rpcError } = await client.rpc("get_place_detail", {
      target_place_id: placeId,
    });

    if (!rpcError && rpcPlace) {
      return mapPlace(rpcPlace);
    }
    if (rpcError && !isMissingRpcError(rpcError)) throw rpcError;
  }

  const [
    { data: placeRow, error: placeError },
    { data: categoryRows, error: categoryError },
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
          heading_photo_thumb_url
        `,
      )
      .eq("place_id", placeId),
  ]);

  if (placeError) throw placeError;
  if (categoryError) throw categoryError;

  return mapPlace({
    ...placeRow,
    place_categories: categoryRows ?? [],
    place_comments: [],
  });
}

export async function fetchPlaceCategoryExtras(placeId: string) {
  const client = ensureClient();
  if (useOptimizedRpc) {
    const { data: rpcRows, error: rpcError } = await client.rpc(
      "get_place_category_extras",
      {
        target_place_id: placeId,
      },
    );

    if (!rpcError) {
      return normalizePlaceCategories(rpcRows ?? []);
    }
    if (!isMissingRpcError(rpcError)) throw rpcError;
  }

  const { data: categoryRows, error } = await client
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
          heading_photo_thumb_url,
          gallery,
          strava
        `,
      )
      .eq("place_id", placeId);
  if (error) throw error;
  return normalizePlaceCategories(categoryRows ?? []);
}

export async function fetchPlaceComments(placeId: string) {
  const client = ensureClient();
  if (useOptimizedRpc) {
    const { data: rpcRows, error: rpcError } = await client.rpc("get_place_comments", {
      target_place_id: placeId,
    });

    if (!rpcError) {
      return (rpcRows ?? []).map(mapComment);
    }
    if (!isMissingRpcError(rpcError)) throw rpcError;
  }

  const { data: commentRows, error } = await client
    .from("place_comments")
    .select("id, name, email, message, created_at, avatar_url")
    .eq("place_id", placeId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;
  return (commentRows ?? []).reverse().map(mapComment);
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

  const uploadedCategories = await uploadCategoryPhotos(placeRow.id, place.categories);
  const categoryRows = uploadedCategories.map((category) => categoryToRow(placeRow.id, category));

  if (categoryRows.length) {
    const { error: categoryError } = await client
      .from("place_categories")
      .insert(categoryRows);
    if (categoryError) throw categoryError;
  }

  return {
    ...place,
    categories: uploadedCategories,
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

  const uploadedCategories = await uploadCategoryPhotos(placeId, place.categories);
  const categoryRows = uploadedCategories.map((category) => categoryToRow(placeId, category));

  if (categoryRows.length) {
    const { error: categoryError } = await client
      .from("place_categories")
      .insert(categoryRows);
    if (categoryError) throw categoryError;
  }

  return {
    ...place,
    categories: uploadedCategories,
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
  comment: {
    name: string;
    email: string;
    message: string;
    profileId?: string;
    avatarUrl?: string;
  },
) {
  const client = ensureClient();
  const { data, error } = await client
    .from("place_comments")
    .insert({
      place_id: placeId,
      name: comment.name,
      email: comment.email,
      message: comment.message,
      profile_id: comment.profileId ?? null,
      avatar_url: comment.avatarUrl ?? null,
    })
    .select("id, name, email, message, created_at, avatar_url")
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
  const { data: rpcAnalytics, error: rpcError } = useOptimizedRpc
    ? await client.rpc("get_creator_analytics")
    : { data: null, error: { code: "RPC_DISABLED" } };

  if (!rpcError) {
    return mapAnalyticsSnapshot(rpcAnalytics as Partial<AnalyticsSnapshot>);
  }
  if (useOptimizedRpc && !isMissingRpcError(rpcError)) throw rpcError;

  const { data, error } = await client
    .from("analytics_events")
    .select("event_type, visitor_role, place_id, section, photo_count, created_at");

  if (error) throw error;

  const rows = (data ?? []) as Array<{
    event_type: string;
    visitor_role: string;
    place_id: string | null;
    section: string | null;
    photo_count: number | null;
    created_at: string;
  }>;

  return rows.reduce<AnalyticsSnapshot>((snapshot, row) => {
    const day = row.created_at.slice(0, 10);
    snapshot.totalVisits += row.event_type === "page_view" ? 1 : 0;
    snapshot.guestVisits +=
      row.event_type === "page_view" && row.visitor_role === "guest" ? 1 : 0;
    snapshot.logins += row.event_type === "login" ? 1 : 0;
    snapshot.eventViews += row.event_type === "place_view" ? 1 : 0;
    snapshot.eventsCreated += row.event_type === "place_created" ? 1 : 0;
    snapshot.photoUploads += row.photo_count ?? 0;

    if (row.event_type === "place_view" && row.place_id) {
      snapshot.placeViews[row.place_id] = (snapshot.placeViews[row.place_id] ?? 0) + 1;
      snapshot.dailyPlaceViews[row.place_id] = {
        ...(snapshot.dailyPlaceViews[row.place_id] ?? {}),
        [day]: (snapshot.dailyPlaceViews[row.place_id]?.[day] ?? 0) + 1,
      };
    }

    if (row.event_type === "section_view" && row.section) {
      snapshot.sectionViews[row.section] =
        (snapshot.sectionViews[row.section] ?? 0) + 1;
      snapshot.dailySectionViews[row.section] = {
        ...(snapshot.dailySectionViews[row.section] ?? {}),
        [day]: (snapshot.dailySectionViews[row.section]?.[day] ?? 0) + 1,
      };
    }

    if (!snapshot.activeDates.includes(day)) {
      snapshot.activeDates.push(day);
    }
    return snapshot;
  }, {
    ...initialAnalytics,
    sectionViews: { ...initialAnalytics.sectionViews },
    placeViews: {},
    dailySectionViews: {},
    dailyPlaceViews: {},
    activeDates: [],
  });
}
