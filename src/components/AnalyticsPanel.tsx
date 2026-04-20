import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { AdventureEvent, AnalyticsSnapshot } from "../types";

type AnalyticsPanelProps = {
  analytics: AnalyticsSnapshot;
  events: AdventureEvent[];
};

type ChartSelection = {
  type: "section" | "place";
  key: string;
  label: string;
};

const metricCards = (analytics: AnalyticsSnapshot) => [
  { label: "Total visits", value: analytics.totalVisits },
  { label: "Guest visits", value: analytics.guestVisits },
  { label: "Logins", value: analytics.logins },
  { label: "Place views", value: analytics.eventViews },
  { label: "Places created", value: analytics.eventsCreated },
  { label: "Photo uploads", value: analytics.photoUploads },
];

const labelizeSection = (section: string) =>
  section
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const dailySeries = (viewsByDay: Record<string, number>) =>
  Object.entries(viewsByDay)
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-14);

export function AnalyticsPanel({ analytics, events }: AnalyticsPanelProps) {
  const placeNames = useMemo(
    () => new Map(events.map((event) => [event.id, event.title])),
    [events],
  );
  const sectionEntries = useMemo(
    () =>
      Object.entries(analytics.sectionViews)
        .filter(([, value]) => value > 0)
        .sort(([, left], [, right]) => right - left),
    [analytics.sectionViews],
  );
  const placeEntries = useMemo(
    () =>
      Object.entries(analytics.placeViews)
        .sort(([, left], [, right]) => right - left),
    [analytics.placeViews],
  );
  const firstSection = sectionEntries[0]?.[0];
  const firstPlace = placeEntries[0]?.[0];
  const [selection, setSelection] = useState<ChartSelection | null>(
    firstSection
      ? { type: "section", key: firstSection, label: labelizeSection(firstSection) }
      : firstPlace
        ? { type: "place", key: firstPlace, label: placeNames.get(firstPlace) ?? "Unknown place" }
        : null,
  );
  useEffect(() => {
    if (selection) return;
    if (firstSection) {
      setSelection({ type: "section", key: firstSection, label: labelizeSection(firstSection) });
      return;
    }
    if (firstPlace) {
      setSelection({
        type: "place",
        key: firstPlace,
        label: placeNames.get(firstPlace) ?? "Unknown place",
      });
    }
  }, [firstPlace, firstSection, placeNames, selection]);
  const chartViews =
    selection?.type === "place"
      ? analytics.dailyPlaceViews[selection.key] ?? {}
      : selection
        ? analytics.dailySectionViews[selection.key] ?? {}
        : {};
  const chartData = dailySeries(chartViews);
  const chartMax = Math.max(...chartData.map(([, value]) => value), 1);

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Analytics</p>
          <h2>Creator-only Supabase activity</h2>
        </div>
        <p className="panel-caption">
          Aggregated from the shared analytics events table.
        </p>
      </div>
      <div className="analytics-grid">
        {metricCards(analytics).map((metric) => (
          <article className="metric-card" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </article>
        ))}
      </div>
      <div className="analytics-sections">
        {Object.entries(analytics.sectionViews).map(([section, value]) => (
          <button
            type="button"
            className="section-pill analytics-pill-button"
            key={section}
            onClick={() =>
              setSelection({ type: "section", key: section, label: labelizeSection(section) })
            }
          >
            <span>{labelizeSection(section)}</span>
            <strong>{value}</strong>
          </button>
        ))}
      </div>
      <div className="analytics-split">
        <div>
          <div className="section-title">
            <h3>Views by place</h3>
            <span>Total place opens</span>
          </div>
          <div className="place-view-list">
            {placeEntries.map(([placeId, value]) => (
              <button
                type="button"
                className="place-view-row"
                key={placeId}
                onClick={() =>
                  setSelection({
                    type: "place",
                    key: placeId,
                    label: placeNames.get(placeId) ?? "Unknown place",
                  })
                }
              >
                <span>{placeNames.get(placeId) ?? "Unknown place"}</span>
                <strong>{value}</strong>
              </button>
            ))}
            {!placeEntries.length ? (
              <p className="guest-copy">No individual place views tracked yet.</p>
            ) : null}
          </div>
        </div>
        <div>
          <div className="section-title">
            <h3>Daily views</h3>
            <span>{selection?.label ?? "Choose an element"}</span>
          </div>
          {chartData.length ? (
            <div className="analytics-chart" aria-label={`Daily views for ${selection?.label}`}>
              {chartData.map(([day, value]) => (
                <button
                  type="button"
                  className="analytics-bar"
                  key={day}
                  style={
                    {
                      "--bar-height": `${Math.max((value / chartMax) * 100, 6)}%`,
                    } as CSSProperties
                  }
                  title={`${day}: ${value} views`}
                >
                  <span>{value}</span>
                  <small>{day.slice(5)}</small>
                </button>
              ))}
            </div>
          ) : (
            <p className="guest-copy">Choose a place or category with tracked views.</p>
          )}
        </div>
      </div>
      <p className="activity-line">
        Active days tracked: {analytics.activeDates.join(", ") || "No activity yet"}
      </p>
    </section>
  );
}
