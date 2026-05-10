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

type RepeatableSectionKey =
  | "trails"
  | "eating_out"
  | "eating_in"
  | "wine_tasting"
  | "beer_tasting"
  | "swim";

type SectionDraft = {
  clientId: string;
  key: Exclude<CategoryKey, "strava" | "trails_2">;
  heading: string;
  description: string;
  headingPhoto?: PhotoAsset;
  gallery: PhotoAsset[];
  strava: StravaUpload;
};

const repeatableSectionOptions: Array<{ key: RepeatableSectionKey; label: string }> = [
  { key: "trails", label: "Trail run / hike" },
  { key: "eating_out", label: "Eating out" },
  { key: "eating_in", label: "Eating in" },
  { key: "wine_tasting", label: "Wine tasting" },
  { key: "beer_tasting", label: "Beer tasting" },
  { key: "swim", label: "Swim spots" },
];

const sectionLabels: Record<SectionDraft["key"], string> = {
  campsite: "Camping",
  accommodation: "Non-camping",
  trails: "Trail run / hike",
  eating_out: "Eating out",
  eating_in: "Eating in",
  wine_tasting: "Wine tasting",
  beer_tasting: "Beer tasting",
  swim: "Swim spots",
};

const emptyStrava = (): StravaUpload => ({
  activityUrl: "",
});

const createSectionDraft = (
  key: SectionDraft["key"],
  overrides: Partial<Omit<SectionDraft, "clientId" | "key">> = {},
): SectionDraft => ({
  clientId: crypto.randomUUID(),
  key,
  heading: "",
  description: "",
  gallery: [],
  strava: emptyStrava(),
  ...overrides,
});

const getBaseSectionKey = (placeType: PlaceType): "campsite" | "accommodation" =>
  placeType === "non-camping" ? "accommodation" : "campsite";

const ensureBaseSection = (sections: SectionDraft[], placeType: PlaceType) => {
  const baseKey = getBaseSectionKey(placeType);
  const filteredSections = sections.filter(
    (section) => section.key !== "campsite" && section.key !== "accommodation",
  );
  const existingBaseSection = sections.find((section) => section.key === baseKey);

  return [
    existingBaseSection ?? createSectionDraft(baseKey),
    ...filteredSections,
  ];
};

const sectionsFromEvent = (event?: AdventureEvent | null, placeType?: PlaceType) => {
  const rawSections: SectionDraft[] = (event?.categories ?? [])
    .filter((category) => category.key !== "strava")
    .map((category) =>
      createSectionDraft(
        (category.key === "trails_2" ? "trails" : category.key) as SectionDraft["key"],
        {
          heading: category.heading,
          description: category.description,
          headingPhoto: category.headingPhoto,
          gallery: category.gallery,
          strava: category.strava ?? emptyStrava(),
        },
      ),
    );

  return ensureBaseSection(rawSections, placeType ?? event?.placeType ?? "camping");
};

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
  const [sections, setSections] = useState<SectionDraft[]>(() =>
    sectionsFromEvent(initialEvent, initialEvent?.placeType),
  );
  const [newSectionKey, setNewSectionKey] = useState<RepeatableSectionKey>("trails");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(initialEvent?.title ?? "");
    setLocationName(initialEvent?.locationName ?? "");
    setContactEmail(initialEvent?.contactEmail ?? "");
    setPlaceType(initialEvent?.placeType ?? "camping");
    setTags(initialEvent?.tags.join(", ") ?? "");
    setNeedToKnows(initialEvent?.needToKnows ?? "");
    setSections(sectionsFromEvent(initialEvent, initialEvent?.placeType));
  }, [initialEvent]);

  useEffect(() => {
    setSections((current) => ensureBaseSection(current, placeType));
  }, [placeType]);

  const canSubmit = useMemo(() => {
    const hasPoint = Boolean(pickedPoint || initialEvent);
    if (!hasPoint || !title.trim() || !locationName.trim() || !needToKnows.trim()) {
      return false;
    }
    if (!sections.length) {
      return false;
    }

    return sections.every((section) =>
      Boolean(section.heading.trim() && section.description.trim() && section.headingPhoto),
    );
  }, [initialEvent, locationName, needToKnows, pickedPoint, sections, title]);

  const validationMessage = useMemo(() => {
    const hasPoint = Boolean(pickedPoint || initialEvent);
    if (!hasPoint) return "Tap the map to choose the pin location.";
    if (!title.trim()) return "Add a location title.";
    if (!locationName.trim()) return "Add an area / place name.";
    if (!needToKnows.trim()) return "Add need-to-knows.";
    if (!sections.length) return "Add at least one section.";

    for (const section of sections) {
      const label = sectionLabels[section.key];
      if (!section.heading.trim()) return `Add a heading for ${label}.`;
      if (!section.description.trim()) return `Add a note for ${label}.`;
      if (!section.headingPhoto) return `Upload a heading picture for ${label}.`;
    }

    return null;
  }, [initialEvent, locationName, needToKnows, pickedPoint, sections, title]);

  const updateSection = (clientId: string, next: Partial<SectionDraft>) => {
    setSections((current) =>
      current.map((section) =>
        section.clientId === clientId
          ? {
              ...section,
              ...next,
            }
          : section,
      ),
    );
  };

  const handleHeadingPhoto = async (
    clientId: string,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const [asset] = await filesToAssets([file]);
    updateSection(clientId, { headingPhoto: asset });
  };

  const handleGalleryUpload = async (
    clientId: string,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    const assets = await filesToAssets(files);
    setSections((current) =>
      current.map((section) =>
        section.clientId === clientId
          ? { ...section, gallery: [...section.gallery, ...assets] }
          : section,
      ),
    );
  };

  const addSection = () => {
    setSections((current) => [...current, createSectionDraft(newSectionKey)]);
  };

  const removeSection = (clientId: string) => {
    setSections((current) => current.filter((section) => section.clientId !== clientId));
  };

  const resetForm = () => {
    setTitle("");
    setLocationName("");
    setContactEmail("");
    setPlaceType("camping");
    setTags("");
    setNeedToKnows("");
    setSections(ensureBaseSection([], "camping"));
    setNewSectionKey("trails");
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

    const builtCategories: LocationCategory[] = sections.map((section) => {
      const stravaUrl = section.strava.activityUrl?.trim() ?? "";

      return {
        id: section.clientId,
        key: section.key,
        heading: section.heading.trim(),
        description: section.description.trim(),
        headingPhoto: section.headingPhoto!,
        gallery: section.gallery,
        strava:
          section.key === "trails" && stravaUrl
            ? {
                activityUrl: stravaUrl,
                activityId: stravaIdFromUrl(stravaUrl),
                title: section.heading.trim(),
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

    const photoCount = builtCategories.reduce(
      (total, category) =>
        total + (category.headingPhoto ? 1 : 0) + category.gallery.length,
      0,
    );

    setIsSubmitting(true);
    try {
      if (isEditing && initialEvent && onUpdateEvent) {
        await onUpdateEvent(initialEvent.id, payload, photoCount);
      } else {
        await onCreateEvent(payload, photoCount);
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
          <h2>{isEditing ? "Update this entry" : "Pick a point, build sections, then publish"}</h2>
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

      <section className="category-editor">
        <div className="section-title">
          <h3>Add sections</h3>
          <span className="author-chip">
            {getBaseSectionKey(placeType) === "campsite" ? "Camping included" : "Non-camping included"}
          </span>
        </div>
        <div className="form-grid">
          <label>
            Section type
            <select
              value={newSectionKey}
              onChange={(event) => setNewSectionKey(event.target.value as RepeatableSectionKey)}
            >
              {repeatableSectionOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="event-form-action">
            <button type="button" className="ghost-button" onClick={addSection}>
              Add section
            </button>
          </div>
        </div>
      </section>

      {sections.map((section, index) => {
        const isBaseSection = index === 0;
        const label = sectionLabels[section.key];

        return (
          <section className="category-editor" key={section.clientId}>
            <div className="section-title">
              <h3>{label}</h3>
              {isBaseSection ? (
                <span className="author-chip">Required from place type</span>
              ) : (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => removeSection(section.clientId)}
                >
                  Remove
                </button>
              )}
            </div>

            <div className="form-grid">
              <label>
                Section heading
                <input
                  value={section.heading}
                  onChange={(event) => updateSection(section.clientId, { heading: event.target.value })}
                />
              </label>
              <label>
                Heading picture
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => handleHeadingPhoto(section.clientId, event)}
                />
              </label>
            </div>
            <label>
              Section note
              <textarea
                rows={4}
                value={section.description}
                onChange={(event) => updateSection(section.clientId, { description: event.target.value })}
              />
            </label>
            {section.key === "trails" ? (
              <label>
                Strava activity link
                <input
                  value={section.strava.activityUrl ?? ""}
                  onChange={(event) =>
                    updateSection(section.clientId, {
                      strava: { activityUrl: event.target.value },
                    })
                  }
                  placeholder="https://www.strava.com/activities/123456789"
                />
              </label>
            ) : null}
            <label>
              Gallery images
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => handleGalleryUpload(section.clientId, event)}
              />
            </label>
          </section>
        );
      })}

      <button type="submit" className="primary-button" disabled={!canSubmit || isSubmitting}>
        {isSubmitting ? "Saving..." : isEditing ? "Update entry" : "Save map location"}
      </button>
      {formError || validationMessage ? (
        <p className="auth-error">{formError ?? validationMessage}</p>
      ) : null}
    </form>
  );
}
