import { initialAnalytics, sampleEvents } from "../data/sampleData";
import { AdventureEvent, AnalyticsSnapshot, StoredState, User } from "../types";

const STORAGE_KEY = "trail-atlas-state";
const STORAGE_VERSION_KEY = "trail-atlas-state-version";
const STORAGE_VERSION = "5";

const cloneAnalytics = (analytics: AnalyticsSnapshot): AnalyticsSnapshot => ({
  ...analytics,
  sectionViews: { ...analytics.sectionViews },
  placeViews: { ...(analytics.placeViews ?? {}) },
  dailySectionViews: Object.fromEntries(
    Object.entries(analytics.dailySectionViews ?? {}).map(([key, views]) => [key, { ...views }]),
  ),
  dailyPlaceViews: Object.fromEntries(
    Object.entries(analytics.dailyPlaceViews ?? {}).map(([key, views]) => [key, { ...views }]),
  ),
  activeDates: [...analytics.activeDates],
});

export const defaultState = (): StoredState => ({
  currentUser: null,
  users: [],
  events: sampleEvents,
  analytics: cloneAnalytics(initialAnalytics),
});

export const loadState = (): StoredState => {
  if (typeof window === "undefined") {
    return defaultState();
  }

  const storedVersion = window.localStorage.getItem(STORAGE_VERSION_KEY);
  if (storedVersion !== STORAGE_VERSION) {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.setItem(STORAGE_VERSION_KEY, STORAGE_VERSION);
    return defaultState();
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return defaultState();
  }

  try {
    const parsed = JSON.parse(raw) as StoredState;
    const validEvents =
      parsed.events?.every(
        (event) =>
          typeof event.title === "string" &&
          typeof event.locationName === "string" &&
          Array.isArray(event.categories),
      ) ?? false;
    return {
      currentUser: parsed.currentUser ?? null,
      users: parsed.users ?? [],
      events: validEvents && parsed.events.length ? parsed.events : sampleEvents,
      analytics: parsed.analytics
        ? cloneAnalytics(parsed.analytics)
        : cloneAnalytics(initialAnalytics),
    };
  } catch {
    return defaultState();
  }
};

export const saveState = (state: StoredState) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_VERSION_KEY, STORAGE_VERSION);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

export const makeUser = (name: string, email: string): User => ({
  id: crypto.randomUUID(),
  name,
  email,
});

export const makeEvent = (
  event: Omit<AdventureEvent, "id" | "createdAt">,
): AdventureEvent => ({
  ...event,
  id: crypto.randomUUID(),
  createdAt: new Date().toISOString().slice(0, 10),
});
