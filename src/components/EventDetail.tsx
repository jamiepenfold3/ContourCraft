import { FormEvent, useState } from "react";
import { ArrowLeft, Heart, Mail, ThumbsUp } from "lucide-react";
import { StravaEmbed } from "./StravaEmbed";
import { AdventureEvent, AppProfile, CategoryKey } from "../types";

type EventDetailProps = {
  event: AdventureEvent;
  profile: AppProfile | null;
  onTrackSection: (section: CategoryKey) => void;
  onBack: () => void;
  onShare: () => void;
  onAddComment: (
    eventId: string,
    comment: { name: string; email: string; message: string; newsletterOptIn: boolean },
  ) => void;
  onRecommend: (eventId: string, email: string) => Promise<void>;
  onToggleFavourite: (eventId: string) => void;
  isFavourited: boolean;
  canFavourite: boolean;
  isLoadingDetails: boolean;
};

const sectionLabels: Partial<Record<CategoryKey, string>> = {
  campsite: "Campsite",
  accommodation: "Accommodation",
  trails: "Trail run / hike 1",
  trails_2: "Trail run / hike 2",
  eating_out: "Eating out",
  eating_in: "Eating in",
  wine_tasting: "Wine tasting",
  beer_tasting: "Beer tasting",
  swim: "Swim spots",
};

const WhatsAppIcon = ({ size = 16 }: { size?: number }) => (
  <svg
    aria-hidden="true"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
  >
    <path
      d="M19.1 4.9A9.9 9.9 0 0 0 3.5 16.8L2.2 21.7l5-1.3A9.9 9.9 0 0 0 21.9 12a9.8 9.8 0 0 0-2.8-7.1Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path
      d="M8.6 7.9c-.2-.5-.4-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1 2.7 1.2 2.9c.1.2 2 3.2 5 4.3 2.5 1 3 .8 3.6.8.5 0 1.7-.7 2-1.4.2-.7.2-1.3.1-1.4-.1-.1-.3-.2-.7-.4l-2-.9c-.3-.1-.5-.2-.7.2-.2.3-.8 1-1 1.2-.2.2-.4.2-.7.1-.4-.2-1.5-.6-2.8-1.8-1-1-1.7-2.1-1.9-2.5-.2-.3 0-.5.1-.7l.5-.6c.2-.2.2-.4.3-.6.1-.2 0-.5 0-.6l-.9-1.9Z"
      fill="currentColor"
    />
  </svg>
);

export function EventDetail({
  event,
  profile,
  onTrackSection,
  onBack,
  onShare,
  onAddComment,
  onRecommend,
  onToggleFavourite,
  isFavourited,
  canFavourite,
  isLoadingDetails,
}: EventDetailProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [newsletterOptIn, setNewsletterOptIn] = useState(false);
  const [recommendMessage, setRecommendMessage] = useState<string | null>(null);

  const handleCommentSubmit = (submitEvent: FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();
    const commentName = profile?.fullName ?? name.trim();
    const commentEmail = profile?.email ?? email.trim();
    if (!commentName || !commentEmail || !message.trim()) {
      return;
    }
    onAddComment(event.id, {
      name: commentName,
      email: commentEmail,
      message: message.trim(),
      newsletterOptIn,
    });
    setName("");
    setEmail("");
    setMessage("");
    setNewsletterOptIn(false);
  };

  const handleRecommendClick = async () => {
    const recommenderEmail = profile?.email ?? email.trim();
    if (!recommenderEmail) {
      setRecommendMessage("You can only recommend if you enter your email below.");
      return;
    }
    setRecommendMessage(null);
    try {
      await onRecommend(event.id, recommenderEmail);
    } catch (recommendError) {
      setRecommendMessage(
        recommendError instanceof Error
          ? recommendError.message
          : "Could not save your recommendation.",
      );
    }
  };

  return (
    <section className="panel event-detail">
      <div className="detail-topbar">
        <div className="detail-actions">
          <button type="button" className="ghost-button share-button" onClick={onShare}>
            <WhatsAppIcon />
            <span>Share</span>
          </button>
          {canFavourite ? (
            <button
              type="button"
              className="ghost-button share-button"
              onClick={() => onToggleFavourite(event.id)}
            >
              <Heart size={16} />
              <span>{isFavourited ? "Favourited" : "Favourite"}</span>
            </button>
          ) : null}
          <a
            className="ghost-button share-button"
            href={`mailto:?subject=${encodeURIComponent(event.title)}&body=${encodeURIComponent(
              `${event.title} - ${window.location.href}`,
            )}`}
          >
            <Mail size={16} />
            <span>Email</span>
          </a>
          <button type="button" className="icon-button back-button" onClick={onBack}>
            <ArrowLeft size={18} />
          </button>
        </div>
      </div>

      {isLoadingDetails ? (
        <div className="loading-inline" role="status" aria-live="polite">
          <span className="loading-spinner" aria-hidden="true" />
          <span>Loading place details</span>
        </div>
      ) : null}

      <div className="panel-heading">
        <div>
          <p className="eyebrow">{event.locationName}</p>
          <h2>{event.title}</h2>
          <div className="tag-row">
            <span className="tag-pill">{event.placeType}</span>
            {event.tags.map((tag) => (
              <span className="tag-pill" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        </div>
        <span className="author-chip">By {event.createdBy}</span>
      </div>

      <div className="section-stack">
        {event.categories.filter((category) => category.key !== "strava").map((category) => (
          <article
            className="category-card"
            key={category.key}
            onMouseEnter={() => onTrackSection(category.key)}
            onTouchStart={() => onTrackSection(category.key)}
          >
            {category.headingPhoto ? (
              <img
                className="category-hero"
                src={category.headingPhoto.url}
                alt={category.headingPhoto.name}
              />
            ) : null}
            <div className="section-title">
              <h3>{sectionLabels[category.key] ?? category.heading}</h3>
              <span className="author-chip">{category.heading}</span>
            </div>
            <p>{category.description}</p>
            {category.gallery.length ? (
              <div className="photo-strip">
                {category.gallery.map((photo) => (
                  <img key={photo.id} src={photo.url} alt={photo.name} />
                ))}
              </div>
            ) : null}
            {category.strava ? (
              <div className="strava-card">
                <div className="section-title">
                  <strong>{category.strava.title ?? "Strava activity"}</strong>
                  <span>{category.strava.activityDate}</span>
                </div>
                <div className="strava-metrics">
                  {category.strava.distance ? <span>{category.strava.distance}</span> : null}
                  {category.strava.elevation ? <span>{category.strava.elevation}</span> : null}
                  {category.strava.duration ? <span>{category.strava.duration}</span> : null}
                </div>
                {category.strava.activityId ? (
                  <StravaEmbed activityId={category.strava.activityId} />
                ) : null}
                {!category.strava.activityId && category.strava.image ? (
                  <img src={category.strava.image} alt={category.strava.title ?? "Strava activity"} />
                ) : null}
                {category.strava.activityUrl ? (
                  <a
                    className="strava-link"
                    href={category.strava.activityUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open on Strava
                  </a>
                ) : null}
              </div>
            ) : null}
          </article>
        ))}
      </div>

      <article className="journal-card">
        <div className="section-title">
          <h3>Need to knows</h3>
          <span>Before you go</span>
        </div>
        <p>{event.needToKnows}</p>
        {event.contactEmail ? (
          <a className="strava-link" href={`mailto:${event.contactEmail}`}>
            Email this place
          </a>
        ) : null}
      </article>

      <article className="journal-card">
        <div className="section-title">
          <h3>Community</h3>
          <button
            type="button"
            className="ghost-button share-button"
            onClick={handleRecommendClick}
          >
            <ThumbsUp size={16} />
            <span>Recommend {event.recommendCount}</span>
          </button>
        </div>
        {recommendMessage ? <p className="auth-error">{recommendMessage}</p> : null}

        <form className="comment-form" onSubmit={handleCommentSubmit}>
          {profile ? (
            <div className="commenting-as">
              {profile.avatarUrl ? (
                <img src={profile.avatarUrl} alt={profile.fullName} />
              ) : null}
              <p className="guest-copy">Commenting as {profile.fullName}.</p>
            </div>
          ) : (
            <div className="form-grid">
              <label>
                Name
                <input value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
            </div>
          )}
          <label>
            Comment
            <textarea
              rows={4}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
          </label>
          <label className="inline-checkbox">
            <input
              type="checkbox"
              checked={newsletterOptIn}
              onChange={(event) => setNewsletterOptIn(event.target.checked)}
            />
            <span>Email me new exciting camp spots</span>
          </label>
          <button type="submit" className="primary-button">
            Add comment
          </button>
        </form>

        <div className="comment-list">
          {event.comments.length ? (
            event.comments
              .slice()
              .reverse()
              .map((comment) => (
                <div className="comment-card" key={comment.id}>
                  <div className="section-title">
                    <div className="comment-author">
                      {comment.avatarUrl ? (
                        <img src={comment.avatarUrl} alt={comment.name} />
                      ) : null}
                      <strong>{comment.name}</strong>
                    </div>
                    <span>{comment.createdAt}</span>
                  </div>
                  <p>{comment.message}</p>
                </div>
              ))
          ) : (
            <p>No comments yet.</p>
          )}
        </div>
      </article>
    </section>
  );
}
