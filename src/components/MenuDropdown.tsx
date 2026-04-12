import { BarChart3, Heart, Menu, PencilLine, Plus, UserRound } from "lucide-react";
import { AppProfile } from "../types";

type MenuDropdownProps = {
  profile: AppProfile | null;
  canCreate: boolean;
  canAccessAnalytics: boolean;
  onAuthAction: () => void;
  onCreateLocation: () => void;
  onManageEntries: () => void;
  onAnalyticsAction: () => void;
  onFavouritesAction: () => void;
  onLogout: () => Promise<void>;
};

export function MenuDropdown({
  profile,
  canCreate,
  canAccessAnalytics,
  onAuthAction,
  onCreateLocation,
  onManageEntries,
  onAnalyticsAction,
  onFavouritesAction,
  onLogout,
}: MenuDropdownProps) {
  return (
    <details className="menu-dropdown">
      <summary className="menu-trigger" aria-label="Open menu">
        <Menu size={18} />
      </summary>
      <div className="menu-panel">
        <button type="button" className="menu-item" onClick={onAuthAction}>
          <UserRound size={16} />
          <span>{profile ? "Account" : "Logins"}</span>
        </button>
        {profile ? (
          <button type="button" className="menu-item" onClick={onFavouritesAction}>
            <Heart size={16} />
            <span>Favourited spots</span>
          </button>
        ) : null}
        <button
          type="button"
          className="menu-item"
          onClick={onCreateLocation}
          disabled={!canCreate}
        >
          <Plus size={16} />
          <span>Create new map location</span>
        </button>
        {canAccessAnalytics ? (
          <button type="button" className="menu-item" onClick={onManageEntries}>
            <PencilLine size={16} />
            <span>Manage existing entries</span>
          </button>
        ) : null}
        {canAccessAnalytics ? (
          <button type="button" className="menu-item" onClick={onAnalyticsAction}>
            <BarChart3 size={16} />
            <span>Analytics</span>
          </button>
        ) : null}
        {profile ? (
          <button type="button" className="menu-item danger" onClick={() => void onLogout()}>
            <span>Log out</span>
          </button>
        ) : null}
      </div>
    </details>
  );
}
