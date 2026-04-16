import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import {
  AdventureEvent,
  AppProfile,
  CategoryKey,
  LocationCategory,
  PhotoAsset,
  PlaceType,
  StravaUpload,
} from "../types";

type Point = {
  lat: number;
  lng: number;
};

type EventFormProps = {
  currentUser: AppProfile;
  pickedPoint: Point | null;
  initialEvent?: AdventureEvent | null;
  onCreateEvent: (
    event: Omit<AdventureEvent, "id" | "createdAt" | "createdBy" | "createdById" | "comments"> & {
      createdByName: string;
    },
    photoCount: number,
  ) => Promise<void>;
  onUpdateEvent?: (
    eventId: string,
    event: Omit<AdventureEvent, "id" | "createdAt" | "createdBy" | "createdById" | "comments"> & {
      createdByName: string;
    },
    photoCount: number,
  ) => Promise<void>;
  onCancel: () => void;
};

type CategoryDraft = {
  enabled: boolean;
  heading: string;
  description: string;
  headingPhoto?: PhotoAsset;
  gallery: PhotoAsset[];
  strava: StravaUpload;
};

const categoryMeta: Array<{ key: CategoryKey; label: string }> = [
  { key: "campsite", label: "Camping" },
  { key: "accommodation", label: "Accommodation" },
  { key: "trails", label: "Trail run / hike 1" },
  { key: "trails_2", label: "Trail run / hike 2" },
  { key: "eating_out", label: "Eating out" },
  { key: "eating_in", label: "Eating in" },
  { key: "wine_tasting", label: "Wine tasting" },
  { key: "beer_tasting", label: "Beer tasting" },
  { key: "swim", label: "Swim spots" },
];

const emptyStrava = (): StravaUpload => ({
  activityUrl: "",
});

const emptyCategories = (): Record<CategoryKey, CategoryDraft> => ({
  campsite: { enabled: false, heading: "", description: "", gallery: [], strava: emptyStrava() },
  accommodation: { enabled: false, heading: "", description: "", gallery: [], strava: emptyStrava() },
  trails: { enabled: false, heading: "", description: "", gallery: [], strava: emptyStrava() },
  trails_2: { enabled: false, heading: "", description: "", gallery: [], strava: emptyStrava() },
  eating_out: { enabled: false, heading: "", description: "", gallery: [], strava: emptyStrava() },
  eating_in: { enabled: false, heading: "", description: "", gallery: [], strava: emptyStrava() },
  wine_tasting: { enabled: false, heading: "", description: "", gallery: [], strava: emptyStrava() },
  beer_tasting: { enabled: false, heading: "", description: "", gallery: [], strava: emptyStrava() },
  swim: { enabled: false, heading: "", description: "", gallery: [], strava: emptyStrava() },
  strava: { enabled: false, heading: "Strava activity", description: "Strava activity link", gallery: [], strava: emptyStrava() },
});

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const filesToAssets = async (files: File[]): Promise<PhotoAsset[]> =>
  Promise.all(
    files.map(async (file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      url: await fileToDataUrl(file),
    })),
  );

const stravaIdFromUrl = (url: string) => {
  const match = url.match(/activities\/(\d+)/);
  return match?.[1];
};

const isTrailCategory = (key: CategoryKey) => key === "trails" || key === "trails_2";

const categoriesToDrafts = (event?: AdventureEvent | null) => {
  const drafts = emptyCategories();
  if (!event) return drafts;

  for (const category of event.categories) {
    drafts[category.key] = {
      enabled: true,
      heading: category.heading,
      description: category.description,
      headingPhoto: category.headingPhoto,
      gallery: category.gallery,
      strava: category.strava ?? emptyStrava(),
    };
  }

  return drafts;
};

export function EventForm({
  currentUser,
  pickedPoint,
  initialEvent,
  onCreateEvent,
  onUpdateEvent,
  onCancel,
}: EventFormProps) {
  const isEditing = Boolean(initialEvent);
  const [title, setTitle] = useState(initialEvent?.title ?? "");
  const [locationName, setLocationName] = useState(initialEvent?.locationName ?? "");
  const [contactEmail, setContactEmail] = useState(initialEvent?.contactEmail ?? "");
  const [placeType, setPlaceType] = useState<PlaceType>(initialEvent?.placeType ?? "camping");
  const [tags, setTags] = useState(initialEvent?.tags.join(", ") ?? "");
  const [needToKnows, setNeedToKnows] = useState(initialEvent?.needToKnows ?? "");
  const [categories, setCategories] =
    useState<Record<CategoryKey, CategoryDraft>>(() => categoriesToDrafts(initialEvent));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const categoryOptions = categoryMeta.filter(({ key }) =>
    placeType === "non-camping" ? key !== "campsite" : key !== "accommodation",
  );

  useEffect(() => {
    setTitle(initialEvent?.title ?? "");
    setLocationName(initialEvent?.locationName ?? "");
    setContactEmail(initialEvent?.contactEmail ?? "");
    setPlaceType(initialEvent?.placeType ?? "camping");
    setTags(initialEvent?.tags.join(", ") ?? "");
    setNeedToKnows(initialEvent?.needToKnows ?? "");
    setCategories(categoriesToDrafts(initialEvent));
  }, [initialEvent]);

  useEffect(() => {
    setCategories((current) => {
      if (placeType === "non-camping") {
        return {
          ...current,
          accommodation: { ...current.accommodation, enabled: true },
          campsite: { ...current.campsite, enabled: false },
        };
      }

      return {
        ...current,
        campsite: { ...current.campsite, enabled: true },
        accommodation: { ...current.accommodation, enabled: false },
      };
    });
  }, [placeType]);

  const enabledCategories = categoryOptions.filter(({ key }) => categories[key].enabled);

  const canSubmit = useMemo(() => {
    const hasPoint = Boolean(pickedPoint || initialEvent);
    if (!hasPoint || !title.trim() || !locationName.trim() || !needToKnows.trim()) {
      return false;
    }
    if (!enabledCategories.length) {
      return false;
    }

    return enabledCategories.every(({ key }) => {
      const category = categories[key];
      return Boolean(category.heading.trim() && category.description.trim() && category.headingPhoto);
    });
  }, [categories, enabledCategories, initialEvent, locationName, needToKnows, pickedPoint, title]);

  const validationMessage = useMemo(() => {
    const hasPoint = Boolean(pickedPoint || initialEvent);
    if (!hasPoint) return "Tap the map to choose the pin location.";
    if (!title.trim()) return "Add a location title.";
    if (!locationName.trim()) return "Add an area / place name.";
    if (!needToKnows.trim()) return "Add need-to-knows.";
    if (!enabledCategories.length) return "Choose at least one section.";

    for (const { key, label } of enabledCategories) {
      const category = categories[key];
      if (!category.heading.trim()) return `Add a heading for ${label}.`;
      if (!category.description.trim()) return `Add a note for ${label}.`;
      if (!category.headingPhoto) return `Upload a heading picture for ${label}.`;
    }

    return null;
  }, [categories, enabledCategories, initialEvent, locationName, needToKnows, pickedPoint, title]);

  const updateCategory = (key: CategoryKey, next: Partial<CategoryDraft>) => {
    setCategories((current) => {
      const nextCategories = {
        ...current,
        [key]: {
          ...current[key],
          ...next,
        },
      };

      return nextCategories;
    });
  };

  const handleHeadingPhoto = async (key: CategoryKey, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const [asset] = await filesToAssets([file]);
    updateCategory(key, { headingPhoto: asset });
  };

  const handleGalleryUpload = async (key: CategoryKey, event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    const assets = await filesToAssets(files);
    updateCategory(key, { gallery: [...categories[key].gallery, ...assets] });
  };

  const resetForm = () => {
    setTitle("");
    setLocationName("");
    setContactEmail("");
    setPlaceType("camping");
    setTags("");
    setNeedToKnows("");
    setCategories(emptyCategories());
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    if (!canSubmit) {
      setFormError(validationMessage ?? "Complete the required fields before saving.");
      return;
    }

    const point = pickedPoint ?? initialEvent;
    if (!point) return;

    const builtCategories: LocationCategory[] = enabledCategories.map(({ key }) => {
      const category = categories[key];
      const stravaUrl = category.strava.activityUrl?.trim() ?? "";

      return {
        key,
        heading: category.heading.trim(),
        description: category.description.trim(),
        headingPhoto: category.headingPhoto!,
        gallery: category.gallery,
        strava:
          isTrailCategory(key) && stravaUrl
            ? {
                activityUrl: stravaUrl,
                activityId: stravaIdFromUrl(stravaUrl),
                title: category.heading.trim(),
              }
            : undefined,
      };
    });

    const payload = {
      title: title.trim(),
      locationName: locationName.trim(),
      lat: point.lat,
      lng: point.lng,
      placeType,
      contactEmail: contactEmail.trim(),
      tags: tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
        .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`)),
      about: "",
      needToKnows: needToKnows.trim(),
      createdByName: currentUser.fullName,
      recommendCount: initialEvent?.recommendCount ?? 0,
      categories: builtCategories,
    };

    setIsSubmitting(true);
    try {
      if (isEditing && initialEvent && onUpdateEvent) {
        await onUpdateEvent(initialEvent.id, payload, builtCategories.reduce((total, category) => total + (category.headingPhoto ? 1 : 0) + category.gallery.length, 0));
      } else {
        await onCreateEvent(payload, builtCategories.reduce((total, category) => total + (category.headingPhoto ? 1 : 0) + category.gallery.length, 0));
      }
      resetForm();
      onCancel();
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : "Failed to save location.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="panel event-form" onSubmit={handleSubmit}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{isEditing ? "Edit map location" : "Create new map location"}</p>
          <h2>{isEditing ? "Update this entry" : "Pick a point, classify it, then publish"}</h2>
        </div>
        <button type="button" className="ghost-button" onClick={onCancel}>
          Close
        </button>
      </div>

      {!isEditing ? (
        <div className="picked-point-card">
          {pickedPoint ? (
            <span>
              Pin selected at {pickedPoint.lat}, {pickedPoint.lng}
            </span>
          ) : (
            <span>Tap a point on the map to place the new location pin.</span>
          )}
        </div>
      ) : null}

      <div className="form-grid">
        <label>
          Location title
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label>
          Area / place name
          <input value={locationName} onChange={(event) => setLocationName(event.target.value)} />
        </label>
        <label>
          Contact email
          <input
            type="email"
            value={contactEmail}
            onChange={(event) => setContactEmail(event.target.value)}
            placeholder="bookings@example.com"
          />
        </label>
        <label>
          Place type
          <select value={placeType} onChange={(event) => setPlaceType(event.target.value as PlaceType)}>
            <option value="camping">Camping</option>
            <option value="wild-camping">Wild camping</option>
            <option value="non-camping">Non-camping</option>
          </select>
        </label>
      </div>

      <label>
        Tags
        <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="#camping, #winefarm, #hike" />
      </label>

      <label>
        Need to knows
        <textarea rows={4} value={needToKnows} onChange={(event) => setNeedToKnows(event.target.value)} />
      </label>

      <div className="category-toggle-grid">
        {categoryOptions.map(({ key, label }) => (
          <label className="toggle-card" key={key}>
            <input
              type="checkbox"
              checked={categories[key].enabled}
              disabled={key === "campsite" || key === "accommodation"}
              onChange={(event) => updateCategory(key, { enabled: event.target.checked })}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>

      {enabledCategories.map(({ key, label }) => (
        <section className="category-editor" key={key}>
          <div className="section-title">
            <h3>{label}</h3>
            <span className="author-chip">Heading picture required</span>
          </div>

          <div className="form-grid">
            <label>
              Section heading
              <input value={categories[key].heading} onChange={(event) => updateCategory(key, { heading: event.target.value })} />
            </label>
            <label>
              Heading picture
              <input type="file" accept="image/*" onChange={(event) => handleHeadingPhoto(key, event)} />
            </label>
          </div>
          <label>
            Section note
            <textarea rows={4} value={categories[key].description} onChange={(event) => updateCategory(key, { description: event.target.value })} />
          </label>
          {isTrailCategory(key) ? (
            <label>
              Strava activity link
              <input
                value={categories[key].strava.activityUrl ?? ""}
                onChange={(event) =>
                  updateCategory(key, {
                    strava: { activityUrl: event.target.value },
                  })
                }
                placeholder="https://www.strava.com/activities/123456789"
              />
            </label>
          ) : null}
          <label>
            Gallery images
            <input type="file" accept="image/*" multiple onChange={(event) => handleGalleryUpload(key, event)} />
          </label>
        </section>
      ))}

      <button type="submit" className="primary-button" disabled={!canSubmit || isSubmitting}>
        {isSubmitting ? "Saving..." : isEditing ? "Update entry" : "Save map location"}
      </button>
      {formError || validationMessage ? (
        <p className="auth-error">{formError ?? validationMessage}</p>
      ) : null}
    </form>
  );
}
