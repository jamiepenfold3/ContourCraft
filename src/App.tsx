import { RefObject, useEffect, useMemo, useRef, useState } from "react";
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
} from "./lib/supabaseApi";
import { isSupabaseConfigured } from "./lib/supabase";
import {
  AdventureEvent,
  AnalyticsSnapshot,
  AppProfile,
  CategoryKey,
} from "./types";

type Point = {
  lat: number;
  lng: number;
};

const currentHashId = () => window.location.hash.replace(/^#location-/, "") || null;

const sortEvents = (events: AdventureEvent[]) =>
  [...events].sort((left, right) => right.createdAt.localeCompare(left.createdAt));

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
  const [mapFilters, setMapFilters] = useState<Record<CategoryKey, boolean>>({
    campsite: false,
    accommodation: false,
    trails: false,
    food: false,
    wineries: false,
    swim: false,
    strava: false,
  });
  const [searchMode, setSearchMode] = useState<"tags" | "title">("tags");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTag, setSelectedTag] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);
  const authSectionRef = useRef<HTMLDivElement | null>(null);
  const createSectionRef = useRef<HTMLDivElement | null>(null);
  const manageSectionRef = useRef<HTMLDivElement | null>(null);
  const analyticsSectionRef = useRef<HTMLDivElement | null>(null);
  const favouritesSectionRef = useRef<HTMLDivElement | null>(null);
  const loadedDetailPlaceIdsRef = useRef(new Set<string>());

  const canCreate = profile?.role === "creator";
  const canAccessAnalytics = profile?.role === "creator";
  const canViewWildCamping =
    profile?.role === "creator" || profile?.wildCampingAccess === true;

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
        if (active) setEvents(sortEvents(places));
      } catch (bootError) {
        if (active) {
          if (isRefreshTokenError(bootError)) {
            await signOut().catch(() => undefined);
            setProfile(null);
            setFavouritePlaceIds([]);
            const places = await fetchPlaces();
            if (active) setEvents(sortEvents(places));
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
              if (active) setEvents(sortEvents(places));
              return;
            }
            const nextProfile = await getProfile(session.user.id);
            if (active) setProfile(nextProfile);
            const favouriteIds = await fetchFavouritePlaceIds(session.user.id);
            if (active) setFavouritePlaceIds(favouriteIds);
            const places = await fetchPlaces();
            if (active) setEvents(sortEvents(places));
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
      .map(([key]) => key as CategoryKey);

    if (!activeFilters.length) {
      return visibleEvents;
    }

    return visibleEvents.filter((event) =>
      activeFilters.every((filter) =>
        event.categories.some((category) => category.key === filter),
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

  const activeMapFilterKeys = useMemo(
    () =>
      Object.entries(mapFilters)
        .filter(([, enabled]) => enabled)
        .map(([key]) => key as CategoryKey),
    [mapFilters],
  );

  const getListPreviewPhoto = (event: AdventureEvent) => {
    const filteredCategory = activeMapFilterKeys
      .map((key) => event.categories.find((category) => category.key === key && category.headingPhoto))
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

    void fetchPlaceDetails(selectedPlaceId)
      .then((detailedPlace) => {
        if (!active) return;
        setEvents((current) =>
          current.map((event) =>
            event.id === selectedPlaceId ? detailedPlace : event,
          ),
        );
      })
      .catch((detailsError) => {
        loadedDetailPlaceIdsRef.current.delete(selectedPlaceId);
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
    loadedDetailPlaceIdsRef.current.clear();
    setEvents(sortEvents(places));
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

  const handleCreateEvent = async (
    event: Omit<AdventureEvent, "id" | "createdAt" | "createdBy" | "createdById" | "comments"> & {
      createdByName: string;
    },
    photoCount: number,
  ) => {
    if (!profile) return;
    try {
      const created = await createPlace(profile.id, event);
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
    await updatePlace(profile.id, eventId, event);
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
    const inserted = await addComment(eventId, comment);
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
        <p className="hero-copy">
          Creator accounts can publish places and view analytics. Viewer accounts can unlock
          wild camping once access is enabled on their profile.
        </p>
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
                    ["food", "Food"],
                    ["wineries", "Wine tasting / breweries"],
                    ["swim", "Swim spots"],
                    ["strava", "Strava"],
                  ].map(([key, label]) => (
                    <label className="toggle-card" key={key}>
                      <input
                        type="checkbox"
                        checked={mapFilters[key as CategoryKey]}
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
                        loading="lazy"
                      />
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
            />
          ) : null}

          {showAnalytics && canAccessAnalytics && analytics ? (
            <div ref={analyticsSectionRef} className="section-anchor">
              <button type="button" className="ghost-button back-section-button" onClick={() => setShowAnalytics(false)}>
                ← Back to map
              </button>
              <AnalyticsPanel analytics={analytics} />
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
                            loading="lazy"
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

          {!selectedEvent && !showCreateForm && !showAnalytics && !showManageEntries && !showFavourites ? (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Access model</p>
                  <h2>Public browsing, creator publishing, gated wild camping.</h2>
                </div>
              </div>
              <p className="guest-copy">
                Standard places are visible to everyone. Wild camping places are hidden unless
                the signed-in profile has the paid-access flag or creator role in Supabase.
              </p>
            </section>
          ) : null}
        </section>
      </main>
    </div>
  );
}
