import { useEffect, useState } from "react";
import { DivIcon, LeafletMouseEvent } from "leaflet";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { AdventureEvent } from "../types";

type Point = {
  lat: number;
  lng: number;
};

type MapViewProps = {
  events: AdventureEvent[];
  selectedEventId: string | null;
  onSelectEvent: (eventId: string) => void;
  creationMode: boolean;
  draftPoint: Point | null;
  onPickLocation: (point: Point) => void;
};

const pinIcon = new DivIcon({
  className: "custom-pin-wrapper",
  html: '<div class="custom-pin"></div>',
  iconSize: [24, 24],
  iconAnchor: [12, 24],
});

const draftPinIcon = new DivIcon({
  className: "custom-pin-wrapper",
  html: '<div class="custom-pin draft-pin"></div>',
  iconSize: [24, 24],
  iconAnchor: [12, 24],
});

const eventIcon = (event: AdventureEvent) =>
  new DivIcon({
    className: "custom-pin-wrapper",
    html: `<div class="emoji-pin">${
      event.placeType !== "non-camping" ||
      event.categories.some((category) => category.key === "campsite")
        ? "🏕️"
        : event.categories.some((category) => category.key === "accommodation")
          ? "🏠"
          : "📍"
    }</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
  });

const FlyToSelection = ({
  events,
  selectedEventId,
  draftPoint,
}: {
  events: AdventureEvent[];
  selectedEventId: string | null;
  draftPoint: Point | null;
}) => {
  const map = useMap();
  const selected = events.find((event) => event.id === selectedEventId);

  useEffect(() => {
    if (draftPoint) {
      map.flyTo([draftPoint.lat, draftPoint.lng], 10, { duration: 0.9 });
      return;
    }
    if (!selected) {
      return;
    }
    map.flyTo([selected.lat, selected.lng], 10, { duration: 0.9 });
  }, [draftPoint, map, selected]);

  return null;
};

const CreateLocationEvents = ({
  creationMode,
  onPickLocation,
}: {
  creationMode: boolean;
  onPickLocation: (point: Point) => void;
}) => {
  useMapEvents({
    click(event: LeafletMouseEvent) {
      if (!creationMode) {
        return;
      }
      onPickLocation({
        lat: Number(event.latlng.lat.toFixed(6)),
        lng: Number(event.latlng.lng.toFixed(6)),
      });
    },
  });

  return null;
};

const MapSizeInvalidator = ({
  tileMode,
  eventCount,
  creationMode,
}: {
  tileMode: string;
  eventCount: number;
  creationMode: boolean;
}) => {
  const map = useMap();

  useEffect(() => {
    const timers = [
      window.setTimeout(() => map.invalidateSize(), 0),
      window.setTimeout(() => map.invalidateSize(), 250),
    ];

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [creationMode, eventCount, map, tileMode]);

  return null;
};

export function MapView({
  events,
  selectedEventId,
  onSelectEvent,
  creationMode,
  draftPoint,
  onPickLocation,
}: MapViewProps) {
  const [tileMode, setTileMode] = useState<"standard" | "satellite">("standard");
  const tileLayer =
    tileMode === "standard"
      ? {
          url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }
      : {
          url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          attribution:
            "Tiles &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community",
        };

  return (
    <div className="map-shell">
      <MapContainer
        center={[-33.92, 18.42]}
        zoom={7}
        scrollWheelZoom
        className="map-canvas"
      >
        <TileLayer
          key={tileMode}
          attribution={tileLayer.attribution}
          url={tileLayer.url}
        />
        <MapSizeInvalidator
          tileMode={tileMode}
          eventCount={events.length}
          creationMode={creationMode}
        />
        <FlyToSelection
          events={events}
          selectedEventId={selectedEventId}
          draftPoint={draftPoint}
        />
        <CreateLocationEvents
          creationMode={creationMode}
          onPickLocation={onPickLocation}
        />
        {events.map((event) => (
          <Marker
            key={event.id}
            position={[event.lat, event.lng]}
            icon={eventIcon(event)}
            eventHandlers={{
              click: () => onSelectEvent(event.id),
            }}
          >
            <Popup>
              <strong>{event.title}</strong>
              <br />
              {event.locationName}
            </Popup>
          </Marker>
        ))}
        {draftPoint ? (
          <Marker
            position={[draftPoint.lat, draftPoint.lng]}
            icon={draftPinIcon}
          >
            <Popup>New location draft</Popup>
          </Marker>
        ) : null}
      </MapContainer>
      <div className="map-overlay">
        <span>{events.length} mapped adventures</span>
        <span>{creationMode ? "Tap the map to place the new pin" : "Guest browsing enabled"}</span>
      </div>
      <button
        type="button"
        className="map-layer-toggle"
        onClick={() =>
          setTileMode((current) => (current === "standard" ? "satellite" : "standard"))
        }
      >
        {tileMode === "standard" ? "Satellite" : "Standard"}
      </button>
    </div>
  );
}
