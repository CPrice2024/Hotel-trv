import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, LocateFixed, MapPin, Navigation } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, type HotelConfig } from "../../api";
import { SiteHeader } from "../SiteHeader";
import { HotelMapCanvas, type MapCoordinates } from "./HotelMapCanvas";
import "./RoomsAndServices.css";

interface GeocodingResult {
  lat: string;
  lon: string;
}

interface RouteResponse {
  code: string;
  routes?: {
    distance: number;
    duration: number;
    geometry: { coordinates: [number, number][] };
  }[];
}

type LocationStatus = "locating" | "found" | "unavailable";

function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Location services are not supported by this browser."));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 60000,
    });
  });
}

function locationErrorMessage(error: unknown): string {
  if (error instanceof GeolocationPositionError) {
    if (error.code === error.PERMISSION_DENIED) {
      return "Location permission was denied. Allow location access in your browser, then try again.";
    }
    if (error.code === error.POSITION_UNAVAILABLE) {
      return "Your current location is unavailable. Check your device settings and try again.";
    }
    return "Location detection timed out. Please try again.";
  }
  return error instanceof Error ? error.message : "We could not detect your location.";
}

export function MapPage() {
  const configQuery = useQuery({
    queryKey: ["hotel-config"],
    queryFn: async () => (await api.get<HotelConfig>("/public/config")).data,
  });
  const hotelName = configQuery.data?.name ?? "Ayele Degu International Hotel";
  const hotelAddress = configQuery.data?.address || "Dilla Town, Gedeo Zone, Ethiopia";
  const hotelLocationQuery = useQuery({
    queryKey: ["hotel-map-location", hotelName, hotelAddress, configQuery.data?.location],
    enabled: Boolean(configQuery.data),
    staleTime: 24 * 60 * 60 * 1000,
    queryFn: async (): Promise<MapCoordinates> => {
      const configuredLocation = configQuery.data?.location;
      if (configuredLocation) return configuredLocation;

      const search = `${hotelName}, ${hotelAddress}`;
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("limit", "1");
      url.searchParams.set("q", search);

      const response = await fetch(url, {
        headers: { "Accept-Language": "en" },
      });
      if (!response.ok) {
        throw new Error("The hotel location service is unavailable. Please try again later.");
      }

      const results = (await response.json()) as GeocodingResult[];
      const firstResult = results[0];
      if (!firstResult) {
        throw new Error(
          "We could not find the hotel on the map. Please configure the hotel's coordinates.",
        );
      }

      const latitude = Number(firstResult.lat);
      const longitude = Number(firstResult.lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        throw new Error("The map service returned invalid hotel coordinates.");
      }

      return { latitude, longitude };
    },
  });

  const [clientLocation, setClientLocation] = useState<MapCoordinates | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("locating");
  const [locationMessage, setLocationMessage] = useState("");
  const [route, setRoute] = useState<[number, number][] | null>(null);
  const [routeSummary, setRouteSummary] = useState("");
  const [routeError, setRouteError] = useState("");
  const [isRouting, setIsRouting] = useState(false);
  const requestedLocation = useRef(false);

  useEffect(() => {
    if (requestedLocation.current) return;
    requestedLocation.current = true;

    getCurrentPosition()
      .then(({ coords }) => {
        setClientLocation({
          latitude: coords.latitude,
          longitude: coords.longitude,
        });
        setLocationStatus("found");
        setLocationMessage("");
      })
      .catch((error: unknown) => {
        setLocationStatus("unavailable");
        setLocationMessage(locationErrorMessage(error));
      });
  }, []);

  const showRoute = async () => {
    const hotelLocation = hotelLocationQuery.data;
    if (!hotelLocation) return;

    setIsRouting(true);
    setRouteError("");
    setRoute(null);
    setRouteSummary("");

    try {
      let origin = clientLocation;
      if (!origin) {
        setLocationStatus("locating");
        setLocationMessage("");
        let position: GeolocationPosition;
        try {
          position = await getCurrentPosition();
        } catch (error) {
          setLocationStatus("unavailable");
          setLocationMessage(locationErrorMessage(error));
          return;
        }
        origin = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setClientLocation(origin);
        setLocationStatus("found");
      }

      const routeUrl = new URL(
        `https://router.project-osrm.org/route/v1/driving/${origin.longitude},${origin.latitude};${hotelLocation.longitude},${hotelLocation.latitude}`,
      );
      routeUrl.searchParams.set("overview", "full");
      routeUrl.searchParams.set("geometries", "geojson");
      const response = await fetch(routeUrl);
      if (!response.ok) {
        throw new Error("The route service is temporarily unavailable.");
      }

      const data = (await response.json()) as RouteResponse;
      const firstRoute = data.routes?.[0];
      if (data.code !== "Ok" || !firstRoute) {
        throw new Error("No driving route could be found for your location.");
      }

      setRoute(
        firstRoute.geometry.coordinates.map(([longitude, latitude]) => [
          latitude,
          longitude,
        ]),
      );
      const distanceKm = firstRoute.distance / 1000;
      const durationMinutes = Math.round(firstRoute.duration / 60);
      setRouteSummary(
        `${distanceKm.toFixed(distanceKm < 10 ? 1 : 0)} km · about ${durationMinutes} min by car`,
      );
    } catch (error) {
      setRouteError(
        error instanceof Error
          ? error.message
          : "We could not calculate a route. Please try again.",
      );
    } finally {
      setIsRouting(false);
    }
  };

  const hotelLocation = hotelLocationQuery.data;

  return (
    <>
      <SiteHeader />
      <main className="catalog-page hotel-map-page">
        <section className="catalog-hero hotel-map-hero">
          <p className="eyebrow">Find your way to us</p>
          <h1>
            Your stay is<br />
            <em>within reach.</em>
          </h1>
          <p>See your location and get a route to {hotelName}.</p>
        </section>

        <section className="section-wrap hotel-map-content">
          <div className="hotel-map-details">
            <div>
              <p className="eyebrow">Visit us</p>
              <h2>{hotelName}</h2>
              <p className="hotel-map-address">
                <MapPin aria-hidden="true" />
                {hotelAddress}
              </p>
            </div>
            <div className="hotel-map-directions">
              <p className="hotel-location-status" role="status">
                <LocateFixed aria-hidden="true" />
                {locationStatus === "locating" && "Detecting your location…"}
                {locationStatus === "found" && "Your location is shown on the map."}
                {locationStatus === "unavailable" && (locationMessage || "Location unavailable.")}
              </p>
              <button
                className="button button-dark"
                type="button"
                onClick={showRoute}
                disabled={!hotelLocation || isRouting}
              >
                <Navigation aria-hidden="true" />
                {isRouting ? "Calculating route…" : "Route me to the hotel"}
              </button>
              {routeSummary && (
                <p className="hotel-route-summary" role="status">{routeSummary}</p>
              )}
              {routeError && <p className="location-error" role="alert">{routeError}</p>}
              <a
                className="hotel-map-external-link"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${hotelName}, ${hotelAddress}`)}`}
                target="_blank"
                rel="noreferrer"
              >
                View hotel in Google Maps <ArrowUpRight aria-hidden="true" />
              </a>
            </div>
          </div>

          {configQuery.isLoading && (
            <p className="catalog-message" role="status">Loading hotel details…</p>
          )}
          {configQuery.isError && (
            <p className="catalog-message catalog-error" role="alert">
              We could not load the hotel address. Please try again later.
            </p>
          )}
          {hotelLocationQuery.isLoading && (
            <p className="catalog-message" role="status">Finding the hotel on the map…</p>
          )}
          {hotelLocationQuery.isError && (
            <p className="catalog-message catalog-error" role="alert">
              {hotelLocationQuery.error instanceof Error
                ? hotelLocationQuery.error.message
                : "We could not find the hotel on the map."}
            </p>
          )}

          {hotelLocation && (
            <HotelMapCanvas
              hotelName={hotelName}
              hotelAddress={hotelAddress}
              hotelLocation={hotelLocation}
              clientLocation={clientLocation}
              route={route}
            />
          )}
          <p className="hotel-map-privacy">
            Your browser asks before sharing your location. If you request a route, your coordinates are sent to the public OpenStreetMap routing service to calculate it.
          </p>
        </section>
      </main>
    </>
  );
}
