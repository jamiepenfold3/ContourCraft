import { FormEvent, useState } from "react";
import { AppProfile } from "../types";

type AuthSheetProps = {
  profile: AppProfile | null;
  onLogin: (email: string, password: string) => Promise<void>;
  onSignUp: (
    fullName: string,
    email: string,
    password: string,
    newsletterOptIn: boolean,
  ) => Promise<void>;
  onLogout: () => Promise<void>;
};

export function AuthSheet({
  profile,
  onLogin,
  onSignUp,
  onLogout,
}: AuthSheetProps) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [newsletterOptIn, setNewsletterOptIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (isSignUp) {
        await onSignUp(fullName, email, password, newsletterOptIn);
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

  if (profile) {
    return (
      <div className="auth-card">
        <div>
          <p className="eyebrow">Signed in</p>
          <h3>{profile.fullName}</h3>
          <p className="guest-copy">
            {profile.role === "creator"
              ? "Creator access enabled. You can publish places and view analytics from the menu."
              : profile.wildCampingAccess
                ? "Wild camping access enabled on this account."
                : "Viewer account active. Wild camping remains locked until access is granted."}
          </p>
        </div>
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

      <button type="submit" className="primary-button" disabled={isSubmitting}>
        {isSubmitting ? "Working..." : isSignUp ? "Create account" : "Login"}
      </button>
    </form>
  );
}
