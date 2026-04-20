export type PhotoAsset = {
  id: string;
  name: string;
  url: string;
  thumbUrl?: string;
  storagePath?: string;
};

export type StravaUpload = {
  activityId?: string;
  activityUrl?: string;
  title?: string;
  distance?: string;
  elevation?: string;
  duration?: string;
  activityDate?: string;
  image?: string;
};

export type CategoryKey =
  | "campsite"
  | "accommodation"
  | "trails"
  | "trails_2"
  | "eating_out"
  | "eating_in"
  | "wine_tasting"
  | "beer_tasting"
  | "swim"
  | "strava";

export type LocationCategory = {
  key: CategoryKey;
  heading: string;
  description: string;
  headingPhoto?: PhotoAsset;
  gallery: PhotoAsset[];
  strava?: StravaUpload;
};

export type EventComment = {
  id: string;
  name: string;
  email: string;
  message: string;
  createdAt: string;
  avatarUrl?: string;
};

export type PlaceType = "wild-camping" | "camping" | "non-camping";

export type ProfileRole = "creator" | "viewer";

export type AppProfile = {
  id: string;
  email: string;
  fullName: string;
  role: ProfileRole;
  wildCampingAccess: boolean;
  avatarPhotoName?: string;
  avatarUrl?: string;
};

export type AdventureEvent = {
  id: string;
  title: string;
  locationName: string;
  lat: number;
  lng: number;
  placeType: PlaceType;
  contactEmail: string;
  tags: string[];
  about: string;
  needToKnows: string;
  createdById?: string;
  createdBy: string;
  createdAt: string;
  recommendCount: number;
  comments: EventComment[];
  categories: LocationCategory[];
};

export type User = {
  id: string;
  name: string;
  email: string;
};

export type AnalyticsSnapshot = {
  totalVisits: number;
  guestVisits: number;
  logins: number;
  eventViews: number;
  eventsCreated: number;
  photoUploads: number;
  sectionViews: Record<string, number>;
  placeViews: Record<string, number>;
  dailySectionViews: Record<string, Record<string, number>>;
  dailyPlaceViews: Record<string, Record<string, number>>;
  activeDates: string[];
};

export type StoredState = {
  currentUser: User | null;
  users: User[];
  events: AdventureEvent[];
  analytics: AnalyticsSnapshot;
};

export type AnalyticsEvent = {
  eventType: string;
  visitorRole: string;
  section: string | null;
  photoCount: number;
  createdAt: string;
};
