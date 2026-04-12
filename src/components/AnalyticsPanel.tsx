import { AnalyticsSnapshot } from "../types";

type AnalyticsPanelProps = {
  analytics: AnalyticsSnapshot;
};

const metricCards = (analytics: AnalyticsSnapshot) => [
  { label: "Total visits", value: analytics.totalVisits },
  { label: "Guest visits", value: analytics.guestVisits },
  { label: "Logins", value: analytics.logins },
  { label: "Place views", value: analytics.eventViews },
  { label: "Places created", value: analytics.eventsCreated },
  { label: "Photo uploads", value: analytics.photoUploads },
];

export function AnalyticsPanel({ analytics }: AnalyticsPanelProps) {
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
          <div className="section-pill" key={section}>
            <span>{section}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <p className="activity-line">
        Active days tracked: {analytics.activeDates.join(", ") || "No activity yet"}
      </p>
    </section>
  );
}
