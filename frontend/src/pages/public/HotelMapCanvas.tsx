import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { translateText, useLanguage } from "../../i18n/language";

export interface MapCoordinates {
  latitude: number;
  longitude: number;
}

interface HotelMapCanvasProps {
  hotelName: string;
  hotelAddress: string;
  hotelLocation: MapCoordinates;
  clientLocation: MapCoordinates | null;
  route: [number, number][] | null;
}

const hotelIcon = L.divIcon({
  className: "map-marker-icon",
  html: '<span class="map-marker map-marker-hotel" aria-hidden="true"></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const clientIcon = L.divIcon({
  className: "map-marker-icon",
  html: '<span class="map-marker map-marker-client" aria-hidden="true"></span>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

export function HotelMapCanvas({
  hotelName,
  hotelAddress,
  hotelLocation,
  clientLocation,
  route,
}: HotelMapCanvasProps) {
  const language = useLanguage();
  const mapElement = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mapElement.current) return;

    const hotelLatLng: L.LatLngExpression = [
      hotelLocation.latitude,
      hotelLocation.longitude,
    ];
    const map = L.map(mapElement.current, {
      scrollWheelZoom: false,
      zoomControl: true,
    }).setView(hotelLatLng, 14);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    const hotelPopup = document.createElement("div");
    const hotelTitle = document.createElement("strong");
    hotelTitle.textContent = hotelName;
    const addressLine = document.createElement("div");
    addressLine.textContent = hotelAddress;
    hotelPopup.append(hotelTitle, addressLine);
    L.marker(hotelLatLng, { icon: hotelIcon })
      .addTo(map)
      .bindPopup(hotelPopup);

    const visiblePoints: L.LatLngExpression[] = [hotelLatLng];
    if (clientLocation) {
      const clientLatLng: L.LatLngExpression = [
        clientLocation.latitude,
        clientLocation.longitude,
      ];
      L.marker(clientLatLng, { icon: clientIcon })
        .addTo(map)
        .bindPopup(translateText("Your current location"));
      visiblePoints.push(clientLatLng);
    }

    if (route) {
      const routeLine = L.polyline(route, {
        color: "#17352e",
        weight: 6,
        opacity: 0.82,
      }).addTo(map);
      map.fitBounds(routeLine.getBounds(), { padding: [36, 36] });
    } else if (visiblePoints.length > 1) {
      map.fitBounds(L.latLngBounds(visiblePoints), { padding: [36, 36], maxZoom: 14 });
    }

    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    resizeObserver.observe(mapElement.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
    };
  }, [clientLocation, hotelAddress, hotelLocation, hotelName, route, language]);

  return (
    <div
      ref={mapElement}
      className="hotel-map-canvas"
      role="region"
      aria-label={translateText(`Interactive map showing ${hotelName} and your location`)}
    />
  );
}
