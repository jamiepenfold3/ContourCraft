import { AdventureEvent, AnalyticsSnapshot } from "../types";

export const initialAnalytics: AnalyticsSnapshot = {
  totalVisits: 0,
  guestVisits: 0,
  logins: 0,
  eventViews: 0,
  eventsCreated: 0,
  photoUploads: 0,
  sectionViews: {
    campsite: 0,
    accommodation: 0,
    trails: 0,
    trails_2: 0,
    eating_out: 0,
    eating_in: 0,
    wine_tasting: 0,
    beer_tasting: 0,
    swim: 0,
  },
  placeViews: {},
  dailySectionViews: {},
  dailyPlaceViews: {},
  activeDates: [],
};

export const sampleEvents: AdventureEvent[] = [
  {
    id: "cederberg-camp",
    title: "Wolfberg Weekend Basecamp",
    locationName: "Cederberg, South Africa",
    lat: -32.378,
    lng: 19.233,
    placeType: "wild-camping",
    contactEmail: "cederberg@example.com",
    tags: ["#cederberg", "#camping", "#trailrun", "#mountains", "#strava"],
    about:
      "A permanent weekend marker for a rugged mountain camp with big granite views, clear morning air, and enough structure to plan a repeat visit.",
    needToKnows:
      "Pack for strong wind after sunset, carry extra water on the higher loop, and expect patchy cell signal once you leave the main road.",
    createdBy: "Trail Atlas",
    createdAt: "2026-04-01",
    recommendCount: 14,
    comments: [
      {
        id: "comment-cederberg-1",
        name: "Mia",
        email: "mia@example.com",
        message: "The campsite notes are accurate. Sunrise loop was the highlight.",
        createdAt: "2026-04-03",
      },
    ],
    categories: [
      {
        key: "campsite",
        heading: "Camp by the granite band",
        description:
          "Flat tent pads sit above the river pools with enough shelter for a calm overnight base. The ground is firm, the sunrise hits early, and the setup works well for a multi-day stop.",
        headingPhoto: {
          id: "cederberg-camp-hero",
          name: "Camp ridge",
          url: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80",
        },
        gallery: [
          {
            id: "cederberg-camp-1",
            name: "Firelight",
            url: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80",
          },
        ],
      },
      {
        key: "trails",
        heading: "Sunrise ridge loop",
        description:
          "A rolling 14 km route climbs steadily toward the viewpoint and returns on a mix of jeep track, sand, and technical rock terraces. It feels best before the heat arrives.",
        headingPhoto: {
          id: "cederberg-trail-hero",
          name: "Trail view",
          url: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80",
        },
        gallery: [],
        strava: {
          activityId: "17794007279",
          activityUrl: "https://www.strava.com/activities/17794007279",
          title: "Wolfberg Dawn Loop",
          distance: "14.2 km",
          elevation: "620 m",
          duration: "1h 34m",
          activityDate: "2026-03-29",
          image:
            "https://images.unsplash.com/photo-1552674605-db6ffd4facb5?auto=format&fit=crop&w=1200&q=80",
        },
      },
      {
        key: "eating_in",
        heading: "Simple fire-cooked meals",
        description:
          "Braai packs, roasted mielies, and a cast-iron breakfast work best here. It is the kind of camp where the food stays uncomplicated and the setting does most of the work.",
        headingPhoto: {
          id: "cederberg-food-hero",
          name: "Camp food",
          url: "https://images.unsplash.com/photo-1528605248644-14dd04022da1?auto=format&fit=crop&w=1200&q=80",
        },
        gallery: [],
      },
      {
        key: "wine_tasting",
        heading: "Swartland detour on the way home",
        description:
          "The drive back opens nicely into a vineyard stop for low-intervention reds and a long lunch. It makes the trip feel complete rather than rushed.",
        headingPhoto: {
          id: "cederberg-wine-hero",
          name: "Wine stop",
          url: "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=1200&q=80",
        },
        gallery: [],
      },
    ],
  },
  {
    id: "hemel-en-aarde",
    title: "Hemel-en-Aarde Coastal Stay",
    locationName: "Hemel-en-Aarde Valley",
    lat: -34.419,
    lng: 19.251,
    placeType: "non-camping",
    contactEmail: "valley@example.com",
    tags: ["#coastal", "#winefarm", "#foodstop", "#easyrun"],
    about:
      "A softer coastal weekend anchored by vineyard roads, short gravel runs, and a slower pace than the mountain camps.",
    needToKnows:
      "Book tastings ahead in peak season, expect stronger traffic near Hermanus midday, and keep a light jacket for late afternoon wind.",
    createdBy: "Trail Atlas",
    createdAt: "2026-03-18",
    recommendCount: 8,
    comments: [],
    categories: [
      {
        key: "trails",
        heading: "Valley gravel loop",
        description:
          "The best outing here is an easy mixed-surface run through vineyards and up toward the ridge above the valley floor.",
        headingPhoto: {
          id: "valley-trail-hero",
          name: "Valley trail",
          url: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80",
        },
        gallery: [],
      },
      {
        key: "eating_out",
        heading: "Long lunch country stop",
        description:
          "Bakery breakfast, wood-fired pizza at lunch, and farm stall produce for a relaxed dinner spread back at the stay.",
        headingPhoto: {
          id: "valley-food-hero",
          name: "Farm lunch",
          url: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1200&q=80",
        },
        gallery: [],
      },
      {
        key: "wine_tasting",
        heading: "Built for cellar hopping",
        description:
          "This stop suits a full day of cellar visits: chardonnay tastings, ocean air, and a final brewery stop before sunset.",
        headingPhoto: {
          id: "valley-wine-hero",
          name: "Cellar stop",
          url: "https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?auto=format&fit=crop&w=1200&q=80",
        },
        gallery: [],
      },
    ],
  },
];
