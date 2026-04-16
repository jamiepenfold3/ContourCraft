import { ChangeEvent, FormEvent, useState } from "react";
import { AppProfile } from "../types";

type AuthSheetProps = {
  profile: AppProfile | null;
  onLogin: (email: string, password: string) => Promise<void>;
  onSignUp: (
    fullName: string,
    email: string,
    password: string,
    newsletterOptIn: boolean,
  ) => Promise<{ requiresEmailConfirmation: boolean }>;
  onLogout: () => Promise<void>;
  onUpdateProfilePhoto: (photo: { name: string; url: string } | null) => Promise<void>;
};

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

export function AuthSheet({
  profile,
  onLogin,
  onSignUp,
  onLogout,
  onUpdateProfilePhoto,
}: AuthSheetProps) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [newsletterOptIn, setNewsletterOptIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPhotoSaving, setIsPhotoSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setIsSubmitting(true);

    try {
      if (isSignUp) {
        const result = await onSignUp(fullName, email, password, newsletterOptIn);
        if (result.requiresEmailConfirmation) {
          setNotice(
            "You should receive an email from Supabase that says please verify your email. Open that link, then come back here and log in.",
          );
        } else {
          setNotice("Your account has been created. You can now log in.");
        }
      } else {
        await onLogin(email, password);
      }
      setFullName("");
      setEmail("");
      setPassword("");
      setNewsletterOptIn(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Auth failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProfilePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    setNotice(null);
    setIsPhotoSaving(true);
    try {
      await onUpdateProfilePhoto({
        name: file.name,
        url: await fileToDataUrl(file),
      });
      setNotice("Profile picture updated.");
    } catch (photoError) {
      setError(photoError instanceof Error ? photoError.message : "Could not update profile picture.");
    } finally {
      setIsPhotoSaving(false);
      event.target.value = "";
    }
  };

  const handleRemoveProfilePhoto = async () => {
    setError(null);
    setNotice(null);
    setIsPhotoSaving(true);
    try {
      await onUpdateProfilePhoto(null);
      setNotice("Profile picture removed.");
    } catch (photoError) {
      setError(photoError instanceof Error ? photoError.message : "Could not remove profile picture.");
    } finally {
      setIsPhotoSaving(false);
    }
  };

  if (profile) {
    return (
      <div className="auth-card">
        <div>
          <p className="eyebrow">Signed in</p>
          <div className="profile-summary">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt={profile.fullName} />
            ) : (
              <span>{profile.fullName.slice(0, 1).toUpperCase()}</span>
            )}
            <h3>{profile.fullName}</h3>
          </div>
          <p className="guest-copy">
            {profile.role === "creator"
              ? "Creator access enabled. You can publish places and view analytics from the menu."
              : profile.wildCampingAccess
                ? "Wild camping access enabled on this account."
                : "Viewer account active. Wild camping remains locked until access is granted."}
          </p>
        </div>
        <label>
          Profile picture
          <input type="file" accept="image/*" onChange={handleProfilePhoto} />
        </label>
        {profile.avatarUrl ? (
          <button
            type="button"
            className="ghost-button"
            disabled={isPhotoSaving}
            onClick={() => void handleRemoveProfilePhoto()}
          >
            Remove profile picture
          </button>
        ) : null}
        {error ? <p className="auth-error">{error}</p> : null}
        {notice ? <p className="auth-notice">{notice}</p> : null}
        <button type="button" className="ghost-button" onClick={() => void onLogout()}>
          Log out
        </button>
      </div>
    );
  }

  return (
    <form className="auth-card" onSubmit={handleSubmit}>
      <div>
        <p className="eyebrow">Supabase auth</p>
        <h3>{isSignUp ? "Create account" : "Login"}</h3>
      </div>

      <div className="auth-toggle-row">
        <button
          type="button"
          className={`toggle-chip ${!isSignUp ? "active" : ""}`}
          onClick={() => setIsSignUp(false)}
        >
          Login
        </button>
        <button
          type="button"
          className={`toggle-chip ${isSignUp ? "active" : ""}`}
          onClick={() => setIsSignUp(true)}
        >
          Sign up
        </button>
      </div>

      {isSignUp ? (
        <label>
          Full name
          <input
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Jamie"
          />
        </label>
      ) : null}

      <label>
        Email
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="jamie@example.com"
        />
      </label>
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="••••••••"
        />
      </label>

      <p className="guest-copy">
        Everyone logs in here. Creator access and paid wild camping access are controlled on
        your Supabase profile after the account exists.
      </p>

      {isSignUp ? (
        <label className="inline-checkbox">
          <input
            type="checkbox"
            checked={newsletterOptIn}
            onChange={(event) => setNewsletterOptIn(event.target.checked)}
          />
          <span>Email me new exciting camp spots</span>
        </label>
      ) : null}

      {error ? <p className="auth-error">{error}</p> : null}
      {notice ? <p className="auth-notice">{notice}</p> : null}

      <button type="submit" className="primary-button" disabled={isSubmitting}>
        {isSubmitting ? "Working..." : isSignUp ? "Create account" : "Login"}
      </button>
    </form>
  );
}
