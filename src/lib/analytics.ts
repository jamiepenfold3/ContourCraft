import { AnalyticsSnapshot } from "../types";

const isoDate = () => new Date().toISOString().slice(0, 10);

export const markAnalyticsActive = (analytics: AnalyticsSnapshot) => {
  const today = isoDate();
  if (!analytics.activeDates.includes(today)) {
    analytics.activeDates = [...analytics.activeDates, today].slice(-14);
  }
};

export const recordVisit = (
  analytics: AnalyticsSnapshot,
  guestVisit: boolean,
): AnalyticsSnapshot => {
  const next = {
    ...analytics,
    totalVisits: analytics.totalVisits + 1,
    guestVisits: analytics.guestVisits + (guestVisit ? 1 : 0),
    sectionViews: { ...analytics.sectionViews },
    placeViews: { ...analytics.placeViews },
    dailySectionViews: { ...analytics.dailySectionViews },
    dailyPlaceViews: { ...analytics.dailyPlaceViews },
    activeDates: [...analytics.activeDates],
  };
  markAnalyticsActive(next);
  return next;
};

export const recordLogin = (analytics: AnalyticsSnapshot): AnalyticsSnapshot => {
  const next = {
    ...analytics,
    logins: analytics.logins + 1,
    sectionViews: { ...analytics.sectionViews },
    placeViews: { ...analytics.placeViews },
    dailySectionViews: { ...analytics.dailySectionViews },
    dailyPlaceViews: { ...analytics.dailyPlaceViews },
    activeDates: [...analytics.activeDates],
  };
  markAnalyticsActive(next);
  return next;
};

export const recordEventView = (
  analytics: AnalyticsSnapshot,
  section?: keyof AnalyticsSnapshot["sectionViews"],
): AnalyticsSnapshot => {
  const next = {
    ...analytics,
    eventViews: analytics.eventViews + 1,
    sectionViews: { ...analytics.sectionViews },
    placeViews: { ...analytics.placeViews },
    dailySectionViews: { ...analytics.dailySectionViews },
    dailyPlaceViews: { ...analytics.dailyPlaceViews },
    activeDates: [...analytics.activeDates],
  };
  if (section) {
    next.sectionViews[section] += 1;
  }
  markAnalyticsActive(next);
  return next;
};

export const recordEventCreated = (
  analytics: AnalyticsSnapshot,
  photoCount: number,
): AnalyticsSnapshot => {
  const next = {
    ...analytics,
    eventsCreated: analytics.eventsCreated + 1,
    photoUploads: analytics.photoUploads + photoCount,
    sectionViews: { ...analytics.sectionViews },
    placeViews: { ...analytics.placeViews },
    dailySectionViews: { ...analytics.dailySectionViews },
    dailyPlaceViews: { ...analytics.dailyPlaceViews },
    activeDates: [...analytics.activeDates],
  };
  markAnalyticsActive(next);
  return next;
};
