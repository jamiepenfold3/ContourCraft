import { FormEvent, useState } from "react";
import { AppProfile } from "../types";

type AuthMode = "creator" | "viewer";

type AuthSheetProps = {
  profile: AppProfile | null;
  onCreatorLogin: (email: string, password: string) => Promise<void>;
  onViewerLogin: (email: string, password: string) => Promise<void>;
  onViewerSignUp: (
    fullName: string,
    email: string,
    password: string,
  ) => Promise<void>;
  onLogout: () => Promise<void>;
};

export function AuthSheet({
  profile,
  onCreatorLogin,
  onViewerLogin,
  onViewerSignUp,
  onLogout,
}: AuthSheetProps) {
  const [mode, setMode] = useState<AuthMode>("creator");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (mode === "creator") {
        await onCreatorLogin(email, password);
      } else if (isSignUp) {
        await onViewerSignUp(fullName, email, password);
      } else {
        await onViewerLogin(email, password);
      }
      setFullName("");
      setEmail("");
      setPassword("");
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
        <h3>{mode === "creator" ? "Creator / Admin login" : "Wild camping login"}</h3>
      </div>

      <div className="auth-toggle-row">
        <button
          type="button"
          className={`toggle-chip ${mode === "creator" ? "active" : ""}`}
          onClick={() => {
            setMode("creator");
            setIsSignUp(false);
          }}
        >
          Creator
        </button>
        <button
          type="button"
          className={`toggle-chip ${mode === "viewer" ? "active" : ""}`}
          onClick={() => setMode("viewer")}
        >
          Wild Camping Viewer
        </button>
      </div>

      {mode === "viewer" ? (
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
      ) : null}

      {mode === "viewer" && isSignUp ? (
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
        {mode === "creator"
          ? "Creator accounts must already be approved in Supabase before sign-in."
          : "Viewer accounts can sign up here. Wild camping remains a paid flag controlled on your Supabase profile."}
      </p>

      {error ? <p className="auth-error">{error}</p> : null}

      <button type="submit" className="primary-button" disabled={isSubmitting}>
        {isSubmitting
          ? "Working..."
          : mode === "creator"
            ? "Login"
            : isSignUp
              ? "Create viewer account"
              : "Login"}
      </button>
    </form>
  );
}
