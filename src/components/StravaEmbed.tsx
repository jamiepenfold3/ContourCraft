import { useEffect } from "react";

type StravaEmbedProps = {
  activityId: string;
};

const SCRIPT_ID = "strava-embed-script";

export function StravaEmbed({ activityId }: StravaEmbedProps) {
  useEffect(() => {
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.remove();
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = "https://strava-embeds.com/embed.js";
    script.async = true;
    document.body.appendChild(script);

    return () => {
      script.remove();
    };
  }, [activityId]);

  return (
    <div
      className="strava-embed-placeholder"
      data-embed-type="activity"
      data-embed-id={activityId}
      data-style="standard"
      data-from-embed="true"
    />
  );
}
