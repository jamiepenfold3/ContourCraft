import { RefObject, useEffect, useMemo, useRef, useState } from "react";
import type { SyntheticEvent } from "react";
import { AnalyticsPanel } from "./components/AnalyticsPanel";
import { AuthSheet } from "./components/AuthSheet";
import { EventDetail } from "./components/EventDetail";
import { EventForm } from "./components/EventForm";
import { MapView } from "./components/MapView";
import { MenuDropdown } from "./components/MenuDropdown";
import { sampleEvents } from "./data/sampleData";
import {
  addComment,
  addFavourite,
  addNewsletterSubscriber,
  createPlace,
  deletePlace,
  fetchAnalytics,
  fetchFavouritePlaceIds,
  fetchPlaceDetails,
  fetchPlacePreviewCategories,
  fetchPlaces,
  getProfile,
  getSession,
  onAuthStateChange,
  recommendPlace,
  removeFavourite,
  signIn,
  signOut,
  signUpViewer,
  trackEvent,
  updatePlace,
  updateProfilePhoto,
} from "./lib/supabaseApi";
import { isSupabaseConfigured } from "./lib/supabase";
import {
  AdventureEvent,
  AnalyticsSnapshot,
  AppProfile,
  CategoryKey,
  LocationCategory,
} from "./types";

type Point = {
  lat: number;
  lng: number;
};

type MapFilterKey =
  | "campsite"
  | "accommodation"
  | "trails"
  | "eating_out"
  | "eating_in"
  | "wine_tasting"
  | "beer_tasting"
  | "swim";

const currentHashId = () => window.location.hash.replace(/^#location-/, "") || null;

const sortEvents = (events: AdventureEvent[]) =>
  [...events].sort((left, right) => right.createdAt.localeCompare(left.createdAt));

const mergeCategoriesByKey = (
  existingCategories: LocationCategory[],
  nextCategories: LocationCategory[],
) => {
  const mergedCategories = [...existingCategories];

  for (const nextCategory of nextCategories) {
    const existingIndex = mergedCategories.findIndex(
      (category) => category.key === nextCategory.key,
    );
    if (existingIndex === -1) {
      mergedCategories.push(nextCategory);
      continue;
    }
    mergedCategories[existingIndex] = {
      ...mergedCategories[existingIndex],
      ...nextCategory,
      headingPhoto: nextCategory.headingPhoto ?? mergedCategories[existingIndex].headingPhoto,
      gallery: nextCategory.gallery.length
        ? nextCategory.gallery
        : mergedCategories[existingIndex].gallery,
      strava: nextCategory.strava ?? mergedCategories[existingIndex].strava,
    };
  }

  return mergedCategories;
};

const categoryMatchesFilter = (category: LocationCategory, filter: MapFilterKey) => {
  if (filter === "trails") {
    return category.key === "trails" || category.key === "trails_2";
  }
  return category.key === filter;
};

const errorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message?: unknown }).message ?? fallback);
  }
  return fallback;
};

const isRefreshTokenError = (error: unknown) => {
  const message = errorMessage(error, "").toLowerCase();
  return (
    message.includes("refresh") ||
    message.includes("invalid refresh token") ||
    message.includes("refresh token not found") ||
    message.includes("auth session missing")
  );
};

const handlePreviewImageError = (
  imageEvent: SyntheticEvent<HTMLImageElement>,
  fallbackUrl?: string,
) => {
  if (!fallbackUrl || imageEvent.currentTarget.src === fallbackUrl) {
    return;
  }
  imageEvent.currentTarget.src = fallbackUrl;
};

export default function App() {
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [events, setEvents] = useState<AdventureEvent[]>(isSupabaseConfigured ? [] : sampleEvents);
  const [analytics, setAnalytics] = useState<AnalyticsSnapshot | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(() => currentHashId());
  const [showAuth, setShowAuth] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showManageEntries, setShowManageEntries] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showFavourites, setShowFavourites] = useState(false);
  const [favouritePlaceIds, setFavouritePlaceIds] = useState<string[]>([]);
  const [draftPoint, setDraftPoint] = useState<Point | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [mapFilters, setMapFilters] = useState<Record<MapFilterKey, boolean>>({
    campsite: false,
    accommodation: false,
    trails: false,
    eating_out: false,
    eating_in: false,
    wine_tasting: false,
    beer_tasting: false,
    swim: false,
  });
  const [searchMode, setSearchMode] = useState<"tags" | "title">("tags");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTag, setSelectedTag] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);
  const [loadingDetailPlaceIds, setLoadingDetailPlaceIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [loadingPreviewPlaceIds, setLoadingPreviewPlaceIds] = useState<Set<string>>(
    () => new Set(),
  );
  const authSectionRef = useRef<HTMLDivElement | null>(null);
  const createSectionRef = useRef<HTMLDivElement | null>(null);
  const manageSectionRef = useRef<HTMLDivElement | null>(null);
  const analyticsSectionRef = useRef<HTMLDivElement | null>(null);
  const favouritesSectionRef = useRef<HTMLDivElement | null>(null);
  const loadedDetailPlaceIdsRef = useRef(new Set<string>());
  const loadedPreviewCategoryPlaceIdsRef = useRef(new Set<string>());
  const previewCategoryCacheRef = useRef(new Map<string, LocationCategory[]>());
  const detailPlaceCacheRef = useRef(new Map<string, AdventureEvent>());

  const canCreate = profile?.role === "creator";
  const canAccessAnalytics = profile?.role === "creator";
  const canViewWildCamping =
    profile?.role === "creator" || profile?.wildCampingAccess === true;

  const clearLoadingPlaceState = () => {
    setLoadingDetailPlaceIds(new Set());
    setLoadingPreviewPlaceIds(new Set());
  };

  const applyCachedPlaceData = (places: AdventureEvent[]) =>
    places.map((place) => {
      const cachedPreviewCategories = previewCategoryCacheRef.current.get(place.id) ?? [];
      const cachedDetail = detailPlaceCacheRef.current.get(place.id);
      if (cachedPreviewCategories.length) {
        loadedPreviewCategoryPlaceIdsRef.current.add(place.id);
      }
      if (cachedDetail) {
        loadedDetailPlaceIdsRef.current.add(place.id);
      }
      const mergedPreviewCategories = mergeCategoriesByKey(
        place.categories,
        cachedPreviewCategories,
      );

      if (!cachedDetail) {
        return {
          ...place,
          categories: mergedPreviewCategories,
        };
      }

      return {
        ...place,
        about: cachedDetail.about,
        needToKnows: cachedDetail.needToKnows,
        contactEmail: cachedDetail.contactEmail,
        createdBy: cachedDetail.createdBy,
        createdById: cachedDetail.createdById,
        comments: cachedDetail.comments,
        categories: mergeCategoriesByKey(mergedPreviewCategories, cachedDetail.categories),
      };
    });

  const setFetchedPlaces = (places: AdventureEvent[]) => {
    clearLoadingPlaceState();
    setEvents(sortEvents(applyCachedPlaceData(places)));
  };

  const invalidatePlaceCache = (placeId: string) => {
    loadedDetailPlaceIdsRef.current.delete(placeId);
    loadedPreviewCategoryPlaceIdsRef.current.delete(placeId);
    previewCategoryCacheRef.current.delete(placeId);
    detailPlaceCacheRef.current.delete(placeId);
  };

  const scrollToSection = (section: RefObject<HTMLDivElement>) => {
    window.setTimeout(() => {
      section.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return;
    }

    let active = true;

    const boot = async () => {
      try {
        const session = await getSession();
        if (session?.user) {
          const nextProfile = await getProfile(session.user.id);
          if (active) setProfile(nextProfile);
          const favouriteIds = await fetchFavouritePlaceIds(session.user.id);
          if (active) setFavouritePlaceIds(favouriteIds);
        }

        const places = await fetchPlaces();
        if (active) {
          setFetchedPlaces(places);
        }
      } catch (bootError) {
        if (active) {
          if (isRefreshTokenError(bootError)) {
            await signOut().catch(() => undefined);
            setProfile(null);
            setFavouritePlaceIds([]);
            const places = await fetchPlaces();
            if (active) {
              setFetchedPlaces(places);
            }
            setError("Your login session expired. Please log in again.");
          } else {
            setError(errorMessage(bootError, "Failed to load app."));
          }
        }
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void boot();

    const { data } = onAuthStateChange((session) => {
      setTimeout(() => {
        void (async () => {
          try {
            if (!session?.user) {
              setProfile(null);
              setShowAnalytics(false);
              const places = await fetchPlaces();
              if (active) {
                setFetchedPlaces(places);
              }
              return;
            }
            const nextProfile = await getProfile(session.user.id);
            if (active) setProfile(nextProfile);
            const favouriteIds = await fetchFavouritePlaceIds(session.user.id);
            if (active) setFavouritePlaceIds(favouriteIds);
            const places = await fetchPlaces();
            if (active) {
              setFetchedPlaces(places);
            }
          } catch (authError) {
            if (active) {
              if (isRefreshTokenError(authError)) {
                await signOut().catch(() => undefined);
                setProfile(null);
                setFavouritePlaceIds([]);
                setShowAnalytics(false);
              } else {
                setError(errorMessage(authError, "Auth refresh failed."));
              }
            }
          }
        })();
      }, 0);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const onHashChange = () => setSelectedEventId(currentHashId());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return;
    }
    if (window.sessionStorage.getItem("trail-atlas-visit-recorded") === "1") {
      return;
    }
    window.sessionStorage.setItem("trail-atlas-visit-recorded", "1");
    void trackEvent({
      eventType: "page_view",
      visitorRole: profile?.role ?? "guest",
    });
  }, [profile?.role]);

  useEffect(() => {
    if (!isSupabaseConfigured || !canAccessAnalytics || !showAnalytics) {
      return;
    }

    void fetchAnalytics()
      .then(setAnalytics)
      .catch((analyticsError) =>
        setError(
          errorMessage(analyticsError, "Failed to load analytics."),
        ),
      );
  }, [canAccessAnalytics, showAnalytics]);

  useEffect(() => {
    if (showAuth) scrollToSection(authSectionRef);
  }, [showAuth]);

  useEffect(() => {
    if (showCreateForm) scrollToSection(createSectionRef);
  }, [showCreateForm]);

  useEffect(() => {
    if (showManageEntries) scrollToSection(manageSectionRef);
  }, [showManageEntries]);

  useEffect(() => {
    if (showAnalytics && analytics) scrollToSection(analyticsSectionRef);
  }, [analytics, showAnalytics]);

  useEffect(() => {
    if (showFavourites) scrollToSection(favouritesSectionRef);
  }, [showFavourites]);

  const visibleEvents = useMemo(
    () =>
      sortEvents(
        events.filter((event) =>
          event.placeType === "wild-camping" ? canViewWildCamping : true,
        ),
      ),
    [canViewWildCamping, events],
  );

  const mapFilteredEvents = useMemo(() => {
    const activeFilters = Object.entries(mapFilters)
      .filter(([, enabled]) => enabled)
      .map(([key]) => key as MapFilterKey);

    if (!activeFilters.length) {
      return visibleEvents;
    }

    return visibleEvents.filter((event) =>
      activeFilters.every((filter) =>
        event.categories.some((category) => categoryMatchesFilter(category, filter)),
      ),
    );
  }, [mapFilters, visibleEvents]);

  const allTags = useMemo(
    () =>
      Array.from(new Set(mapFilteredEvents.flatMap((event) => event.tags))).sort((left, right) =>
        left.localeCompare(right),
      ),
    [mapFilteredEvents],
  );

  const filteredEvents = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return mapFilteredEvents.filter((event) => {
      if (searchMode === "tags") {
        const tagMatches = selectedTag === "all" ? true : event.tags.includes(selectedTag);
        const keywordMatches = !term
          ? true
          : event.tags.some((tag) => tag.toLowerCase().includes(term));
        return tagMatches && keywordMatches;
      }

      return !term
        ? true
        : [event.title, event.locationName, ...event.categories.map((category) => category.heading)]
            .join(" ")
            .toLowerCase()
            .includes(term);
    });
  }, [mapFilteredEvents, searchMode, searchTerm, selectedTag]);

  const previewEvents = useMemo(() => filteredEvents.slice(0, 10), [filteredEvents]);

  useEffect(() => {
    if (!isSupabaseConfigured || selectedEventId) {
      return;
    }

    const unloadedPlaceIds = previewEvents
      .map((event) => event.id)
      .filter((placeId) => !loadedPreviewCategoryPlaceIdsRef.current.has(placeId));
    if (!unloadedPlaceIds.length) {
      return;
    }

    unloadedPlaceIds.forEach((placeId) => {
      loadedPreviewCategoryPlaceIdsRef.current.add(placeId);
    });
    setLoadingPreviewPlaceIds((current) => {
      const next = new Set(current);
      unloadedPlaceIds.forEach((placeId) => next.add(placeId));
      return next;
    });

    let active = true;
    void fetchPlacePreviewCategories(unloadedPlaceIds)
      .then((categoryRows) => {
        if (!active) return;
        setEvents((current) =>
          current.map((event) => {
            if (!unloadedPlaceIds.includes(event.id)) return event;
            const nextCategories = categoryRows
              .filter((category) => category.place_id === event.id)
              .map((category) => ({
                key: category.key,
                heading: category.heading,
                description: category.description,
                headingPhoto: category.heading_photo_url || category.heading_photo_thumb_url
                  ? {
                      id: `${category.id}-heading`,
                      name: category.heading_photo_name ?? category.heading,
                      url: category.heading_photo_url ?? category.heading_photo_thumb_url,
                      thumbUrl: category.heading_photo_thumb_url ?? undefined,
                    }
                  : undefined,
                gallery: [],
                strava: undefined,
              }));
            previewCategoryCacheRef.current.set(
              event.id,
              mergeCategoriesByKey(
                previewCategoryCacheRef.current.get(event.id) ?? [],
                nextCategories,
              ),
            );

            return {
              ...event,
              categories: mergeCategoriesByKey(event.categories, nextCategories),
            };
          }),
        );
        setLoadingPreviewPlaceIds((current) => {
          const next = new Set(current);
          unloadedPlaceIds.forEach((placeId) => next.delete(placeId));
          return next;
        });
      })
      .catch((previewError) => {
        unloadedPlaceIds.forEach((placeId) => {
          loadedPreviewCategoryPlaceIdsRef.current.delete(placeId);
        });
        setLoadingPreviewPlaceIds((current) => {
          const next = new Set(current);
          unloadedPlaceIds.forEach((placeId) => next.delete(placeId));
          return next;
        });
        if (active) {
          setError(errorMessage(previewError, "Failed to load place previews."));
        }
      });

    return () => {
      active = false;
    };
  }, [previewEvents, selectedEventId]);

  const activeMapFilterKeys = useMemo(
    () =>
      Object.entries(mapFilters)
        .filter(([, enabled]) => enabled)
        .map(([key]) => key as MapFilterKey),
    [mapFilters],
  );

  const getListPreviewPhoto = (event: AdventureEvent) => {
    const filteredCategory = activeMapFilterKeys
      .map((key) =>
        event.categories.find(
          (category) => categoryMatchesFilter(category, key) && category.headingPhoto,
        ),
      )
      .find(Boolean);

    return (
      filteredCategory?.headingPhoto ??
      event.categories.find(
        (category) =>
          (category.key === "campsite" || category.key === "accommodation") &&
          category.headingPhoto,
      )?.headingPhoto ??
      event.categories.find((category) => category.headingPhoto)?.headingPhoto
    );
  };

  const getCampingPreviewCategory = (event: AdventureEvent) =>
    event.categories.find(
      (category) =>
        (category.key === "campsite" || category.key === "accommodation") &&
        category.headingPhoto,
    ) ??
    event.categories.find(
      (category) => category.key === "campsite" || category.key === "accommodation",
    );

  const selectedEvent = mapFilteredEvents.find((event) => event.id === selectedEventId) ?? null;
  const editingEvent = events.find((event) => event.id === editingEventId) ?? null;

  useEffect(() => {
    if (!isSupabaseConfigured || !selectedEvent) {
      return;
    }
    const selectedPlaceId = selectedEvent.id;
    if (loadedDetailPlaceIdsRef.current.has(selectedPlaceId)) {
      return;
    }

    let active = true;
    loadedDetailPlaceIdsRef.current.add(selectedPlaceId);
    setLoadingDetailPlaceIds((current) => new Set(current).add(selectedPlaceId));

    void fetchPlaceDetails(selectedPlaceId)
      .then((detailedPlace) => {
        if (!active) return;
        const cachedDetail = {
          ...detailedPlace,
          categories: mergeCategoriesByKey(
            previewCategoryCacheRef.current.get(selectedPlaceId) ?? [],
            detailedPlace.categories,
          ),
        };
        detailPlaceCacheRef.current.set(selectedPlaceId, cachedDetail);
        setEvents((current) =>
          current.map((event) =>
            event.id === selectedPlaceId
              ? {
                  ...cachedDetail,
                  categories: mergeCategoriesByKey(event.categories, cachedDetail.categories),
                }
              : event,
          ),
        );
        setLoadingDetailPlaceIds((current) => {
          const next = new Set(current);
          next.delete(selectedPlaceId);
          return next;
        });
      })
      .catch((detailsError) => {
        loadedDetailPlaceIdsRef.current.delete(selectedPlaceId);
        setLoadingDetailPlaceIds((current) => {
          const next = new Set(current);
          next.delete(selectedPlaceId);
          return next;
        });
        if (active) {
          setError(errorMessage(detailsError, "Failed to load place details."));
        }
      });

    return () => {
      active = false;
    };
  }, [selectedEvent?.id]);

  const refreshPlaces = async () => {
    if (!isSupabaseConfigured) return;
    const places = await fetchPlaces();
    setFetchedPlaces(places);
  };

  const handleLogin = async (email: string, password: string) => {
    await signIn(email, password);
    void trackEvent({ eventType: "login", visitorRole: "user" }).catch((trackError) =>
      setError(errorMessage(trackError, "Analytics tracking failed.")),
    );
    setShowAuth(false);
  };

  const handleSignUp = async (
    fullName: string,
    email: string,
    password: string,
    newsletterOptIn: boolean,
  ) => {
    const result = await signUpViewer(fullName, email, password);
    if (newsletterOptIn) {
      await addNewsletterSubscriber(fullName, email, "signup");
    }
    if (!result.requiresEmailConfirmation) {
      setShowAuth(false);
    }
    return result;
  };

  const handleLogout = async () => {
    await signOut();
    setProfile(null);
    setFavouritePlaceIds([]);
    setShowCreateForm(false);
  };

  const handleUpdateProfilePhoto = async (photo: { name: string; url: string } | null) => {
    if (!profile) return;
    const nextProfile = await updateProfilePhoto(profile.id, photo);
    setProfile(nextProfile);
  };

  const handleCreateEvent = async (
    event: Omit<AdventureEvent, "id" | "createdAt" | "createdBy" | "createdById" | "comments"> & {
      createdByName: string;
    },
    photoCount: number,
  ) => {
    if (!profile) return;
    try {
      const created = await createPlace(profile.id, event);
      detailPlaceCacheRef.current.set(created.id, created);
      loadedDetailPlaceIdsRef.current.add(created.id);
      setEvents((current) => sortEvents([created, ...current]));
      setDraftPoint(null);
      setShowCreateForm(false);
      setShowManageEntries(false);
      setSelectedEventId(created.id);
      window.location.hash = `location-${created.id}`;
      void trackEvent({
        eventType: "place_created",
        visitorRole: profile.role,
        placeId: created.id,
        photoCount,
      }).catch(() => undefined);
    } catch (saveError) {
      setError(errorMessage(saveError, "Failed to save location."));
      throw saveError;
    }
  };

  const handleUpdateEvent = async (
    eventId: string,
    event: Omit<AdventureEvent, "id" | "createdAt" | "createdBy" | "createdById" | "comments"> & {
      createdByName: string;
    },
    photoCount: number,
  ) => {
    if (!profile) return;
    const updated = await updatePlace(profile.id, eventId, event);
    invalidatePlaceCache(eventId);
    detailPlaceCacheRef.current.set(eventId, updated);
    loadedDetailPlaceIdsRef.current.add(eventId);
    await refreshPlaces();
    setEditingEventId(null);
    setShowCreateForm(false);
    setShowManageEntries(true);
    void trackEvent({
      eventType: "place_updated",
      visitorRole: profile.role,
      placeId: eventId,
      photoCount,
    }).catch(() => undefined);
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!profile) return;
    const confirmed = window.confirm("Delete this entry? This cannot be undone.");
    if (!confirmed) return;
    await deletePlace(profile.id, eventId);
    invalidatePlaceCache(eventId);
    setEvents((current) => current.filter((event) => event.id !== eventId));
    if (selectedEventId === eventId) {
      setSelectedEventId(null);
    }
  };

  const handleSelectEvent = (eventId: string) => {
    setSelectedEventId(eventId);
    window.location.hash = `location-${eventId}`;
    void trackEvent({
      eventType: "place_view",
      visitorRole: profile?.role ?? "guest",
      placeId: eventId,
    });
  };

  const handleBackToMap = () => {
    setSelectedEventId(null);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  };

  const handleTrackSection = (section: CategoryKey) => {
    if (!selectedEvent) return;
    void trackEvent({
      eventType: "section_view",
      visitorRole: profile?.role ?? "guest",
      placeId: selectedEvent.id,
      section,
    });
  };

  const handleCreateLocation = () => {
    if (!isSupabaseConfigured) {
      setError("Configure Supabase first to create shared places.");
      return;
    }
    if (!canCreate) {
      setShowAuth(true);
      scrollToSection(authSectionRef);
      return;
    }
    setShowCreateForm(true);
    setShowManageEntries(false);
    setShowAnalytics(false);
    setEditingEventId(null);
    setDraftPoint(null);
    setSelectedEventId(null);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    scrollToSection(createSectionRef);
  };

  const handleShare = async () => {
    if (!selectedEvent) return;
    const shareUrl = `${window.location.origin}${window.location.pathname}#location-${selectedEvent.id}`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(
      `${selectedEvent.title} ${shareUrl}`,
    )}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: selectedEvent.title,
          text: selectedEvent.needToKnows,
          url: shareUrl,
        });
        return;
      } catch {}
    }

    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  };

  const handleAddComment = async (
    eventId: string,
    comment: { name: string; email: string; message: string; newsletterOptIn: boolean },
  ) => {
    if (!isSupabaseConfigured) {
      setError("Configure Supabase first to save comments for all devices.");
      return;
    }
    if (comment.newsletterOptIn) {
      await addNewsletterSubscriber(comment.name, comment.email, "comment");
    }
    const inserted = await addComment(eventId, {
      ...comment,
      profileId: profile?.id,
      avatarUrl: profile?.avatarUrl,
    });
    setEvents((current) =>
      current.map((event) =>
        event.id === eventId
          ? { ...event, comments: [...event.comments, inserted] }
          : event,
      ),
    );
  };

  const handleRecommend = async (eventId: string, email: string) => {
    if (!isSupabaseConfigured) {
      setError("Configure Supabase first to persist recommendations.");
      return;
    }
    const nextRecommendCount = await recommendPlace(eventId, email);
    setEvents((current) =>
      current.map((event) =>
        event.id === eventId
          ? { ...event, recommendCount: nextRecommendCount }
          : event,
      ),
    );
  };

  const handleToggleFavourite = async (eventId: string) => {
    if (!profile) {
      setShowAuth(true);
      scrollToSection(authSectionRef);
      return;
    }

    const isFavourited = favouritePlaceIds.includes(eventId);
    if (isFavourited) {
      await removeFavourite(profile.id, eventId);
      setFavouritePlaceIds((current) => current.filter((id) => id !== eventId));
      return;
    }

    await addFavourite(profile.id, eventId);
    setFavouritePlaceIds((current) => [...current, eventId]);
  };

  return (
    <div className="app-shell">
      <header className="hero-card">
        <div className="hero-topbar">
          <div>
            <p className="eyebrow">ContourCraft</p>
            <h1>A place to find weekend getaway spots with your favourite interests such as Wine Tastings, Breweries, Trail Running, hiking, Swim Spots and Food Spots</h1>
          </div>
          <MenuDropdown
            profile={profile}
            canCreate={canCreate}
            canAccessAnalytics={canAccessAnalytics}
            onAuthAction={() => {
              if (!isSupabaseConfigured) {
                setError("Add your Supabase URL and anon key before using auth.");
                return;
              }
              setShowAuth((current) => !current);
              scrollToSection(authSectionRef);
            }}
            onCreateLocation={handleCreateLocation}
            onAnalyticsAction={() => {
              setShowAnalytics((current) => !current);
              setShowCreateForm(false);
              setShowManageEntries(false);
              setShowFavourites(false);
              scrollToSection(analyticsSectionRef);
            }}
            onManageEntries={() => {
              setShowManageEntries((current) => !current);
              setShowCreateForm(false);
              setShowAnalytics(false);
              setShowFavourites(false);
              setSelectedEventId(null);
              scrollToSection(manageSectionRef);
            }}
            onFavouritesAction={() => {
              setShowFavourites((current) => !current);
              setShowCreateForm(false);
              setShowAnalytics(false);
              setShowManageEntries(false);
              setSelectedEventId(null);
              scrollToSection(favouritesSectionRef);
            }}
            onLogout={handleLogout}
          />
        </div>
        {!isSupabaseConfigured ? (
          <div className="config-notice">
            Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to run against Supabase.
            The sample content below is read-only until then.
          </div>
        ) : null}
        {error ? <div className="auth-error">{error}</div> : null}
      </header>

      {isLoading ? (
        <div className="loading-map-screen" role="status" aria-live="polite">
          <div className="loading-map-card">
            <p className="eyebrow">ContourCraft</p>
            <h2>Loading Map</h2>
            <p className="guest-copy">Fetching the latest places from Supabase.</p>
          </div>
        </div>
      ) : null}

      <main className="layout-grid">
        <section className="map-column">
          <MapView
            events={mapFilteredEvents}
            selectedEventId={selectedEvent?.id ?? null}
            onSelectEvent={handleSelectEvent}
            creationMode={showCreateForm}
            draftPoint={draftPoint}
            onPickLocation={setDraftPoint}
          />
          {!selectedEvent ? (
            <section className="panel search-panel">
              <div>
                <p className="eyebrow">Map filters</p>
                <div className="category-toggle-grid">
                  {[
                    ["campsite", "Camping"],
                    ["accommodation", "Accommodation"],
                    ["trails", "Trail run / hike"],
                    ["eating_out", "Eating out"],
                    ["eating_in", "Eating in"],
                    ["wine_tasting", "Wine tasting"],
                    ["beer_tasting", "Beer tasting"],
                    ["swim", "Swim spots"],
                  ].map(([key, label]) => (
                    <label className="toggle-card" key={key}>
                      <input
                        type="checkbox"
                        checked={mapFilters[key as MapFilterKey]}
                        onChange={(event) =>
                          setMapFilters((current) => ({
                            ...current,
                            [key]: event.target.checked,
                          }))
                        }
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="search-row">
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder={
                    searchMode === "tags"
                      ? "Search tags or interests"
                      : "Search headings or place names"
                  }
                />
                <button
                  type="button"
                  className="icon-button search-toggle"
                  onClick={() =>
                    setSearchMode((current) => (current === "tags" ? "title" : "tags"))
                  }
                >
                  {searchMode === "tags" ? "Tags" : "Headings"}
                </button>
              </div>
              <div className="search-row">
                <select
                  value={selectedTag}
                  onChange={(event) => setSelectedTag(event.target.value)}
                  disabled={searchMode !== "tags"}
                >
                  <option value="all">All #tags</option>
                  {allTags.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
                <small className="search-helper">
                  Wild camping results only appear for paid-access viewers or creators.
                </small>
              </div>
            </section>
          ) : null}
          {!selectedEvent ? (
            <div className="event-list">
              {previewEvents.map((event) => {
                const previewCategory = getCampingPreviewCategory(event);
                const previewPhoto = previewCategory?.headingPhoto;
                const isPreviewLoading = loadingPreviewPlaceIds.has(event.id);
                return (
                  <button
                    type="button"
                    key={event.id}
                    className="event-list-item"
                    onClick={() => handleSelectEvent(event.id)}
                  >
                    {previewPhoto ? (
                      <img
                        className="event-preview-image"
                        src={previewPhoto.url}
                        alt={previewPhoto.name}
                        loading="eager"
                        decoding="async"
                        onError={(imageEvent) =>
                          handlePreviewImageError(imageEvent, previewPhoto.thumbUrl)
                        }
                      />
                    ) : isPreviewLoading ? (
                      <span className="event-preview-loading" aria-label="Loading preview photo">
                        <span className="loading-spinner" aria-hidden="true" />
                      </span>
                    ) : null}
                    <span>{event.title}</span>
                    <small>{event.locationName}</small>
                    {previewCategory ? <p>{previewCategory.description}</p> : null}
                  </button>
                );
              })}
              {filteredEvents.length > previewEvents.length ? (
                <p className="guest-copy">Showing 10 previews. Use the map, filters, or search to narrow the list.</p>
              ) : null}
              {!filteredEvents.length ? (
                <section className="panel">
                  <p className="guest-copy">No places matched that search.</p>
                </section>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="content-column">
          {showAuth ? (
            <div ref={authSectionRef}>
              <AuthSheet
                profile={profile}
                onLogin={handleLogin}
                onSignUp={handleSignUp}
                onLogout={handleLogout}
                onUpdateProfilePhoto={handleUpdateProfilePhoto}
              />
            </div>
          ) : null}

          {selectedEvent ? (
            <EventDetail
              event={selectedEvent}
              profile={profile}
              onTrackSection={handleTrackSection}
              onBack={handleBackToMap}
              onShare={handleShare}
              onAddComment={handleAddComment}
              onRecommend={handleRecommend}
              onToggleFavourite={handleToggleFavourite}
              isFavourited={favouritePlaceIds.includes(selectedEvent.id)}
              canFavourite={Boolean(profile)}
              isLoadingDetails={loadingDetailPlaceIds.has(selectedEvent.id)}
            />
          ) : null}

          {showAnalytics && canAccessAnalytics && analytics ? (
            <div ref={analyticsSectionRef} className="section-anchor">
              <button type="button" className="ghost-button back-section-button" onClick={() => setShowAnalytics(false)}>
                ← Back to map
              </button>
              <AnalyticsPanel analytics={analytics} events={events} />
            </div>
          ) : null}

          {canCreate && showManageEntries ? (
            <section className="panel" ref={manageSectionRef}>
              <button type="button" className="ghost-button back-section-button" onClick={() => setShowManageEntries(false)}>
                ← Back to map
              </button>
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Manage entries</p>
                  <h2>Edit or delete your existing places</h2>
                </div>
              </div>
              <div className="event-list">
                {events
                  .filter((event) => event.createdById === profile?.id)
                  .map((event) => (
                  <div className="manage-entry-card" key={event.id}>
                    <div>
                      <strong>{event.title}</strong>
                      <p className="guest-copy">{event.locationName}</p>
                    </div>
                    <div className="detail-actions">
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => {
                          setEditingEventId(event.id);
                          setShowCreateForm(true);
                          scrollToSection(createSectionRef);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="ghost-button danger-button"
                        onClick={() => void handleDeleteEvent(event.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {showFavourites ? (
            <section className="panel" ref={favouritesSectionRef}>
              <button type="button" className="ghost-button back-section-button" onClick={() => setShowFavourites(false)}>
                ← Back to map
              </button>
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Favourites</p>
                  <h2>Your favourited spots</h2>
                </div>
              </div>
              <div className="event-list">
                {events
                  .filter((event) => favouritePlaceIds.includes(event.id))
                  .slice(0, 10)
                  .map((event) => {
                    const previewCategory = getCampingPreviewCategory(event);
                    const previewPhoto = previewCategory?.headingPhoto ?? getListPreviewPhoto(event);
                    return (
                      <button
                        type="button"
                        key={event.id}
                        className="event-list-item"
                        onClick={() => handleSelectEvent(event.id)}
                      >
                        {previewPhoto ? (
                          <img
                            className="event-preview-image"
                            src={previewPhoto.url}
                            alt={previewPhoto.name}
                            loading="eager"
                            decoding="async"
                            onError={(imageEvent) =>
                              handlePreviewImageError(imageEvent, previewPhoto.thumbUrl)
                            }
                          />
                        ) : null}
                        <span>{event.title}</span>
                        <small>{event.locationName}</small>
                        {previewCategory ? <p>{previewCategory.description}</p> : null}
                      </button>
                    );
                  })}
                {!favouritePlaceIds.length ? (
                  <p className="guest-copy">No favourited spots yet.</p>
                ) : null}
              </div>
            </section>
          ) : null}

          {canCreate && showCreateForm ? (
            <div ref={createSectionRef}>
              <EventForm
                currentUser={profile!}
                pickedPoint={draftPoint}
                initialEvent={editingEvent}
                onCreateEvent={handleCreateEvent}
                onUpdateEvent={handleUpdateEvent}
                onCancel={() => {
                  setShowCreateForm(false);
                  setDraftPoint(null);
                  setEditingEventId(null);
                }}
              />
            </div>
          ) : null}

        </section>
      </main>
    </div>
  );
}
