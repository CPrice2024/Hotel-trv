import { MapPinned } from "lucide-react";
import { useState } from "react";

interface HotelDirectionsButtonProps {
  destination: string;
  className?: string;
}

export function HotelDirectionsButton({
  destination,
  className = "button button-dark",
}: HotelDirectionsButtonProps) {
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState("");

  const getDirections = () => {
    if (!navigator.geolocation) {
      setLocationError("Location access is not supported by this browser.");
      return;
    }

    setLocationError("");
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const directionsUrl = new URL("https://www.google.com/maps/dir/");
        directionsUrl.searchParams.set("api", "1");
        directionsUrl.searchParams.set(
          "origin",
          `${coords.latitude},${coords.longitude}`,
        );
        directionsUrl.searchParams.set("destination", destination);
        directionsUrl.searchParams.set("travelmode", "driving");
        window.location.assign(directionsUrl.toString());
      },
      (error) => {
        const message =
          error.code === error.PERMISSION_DENIED
            ? "Location permission was denied. Allow location access in your browser to get directions."
            : error.code === error.POSITION_UNAVAILABLE
              ? "Your location is unavailable. Please try again or open the map directly."
              : "We could not get your location in time. Please try again.";
        setLocationError(message);
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  };

  return (
    <div className="hotel-directions-action">
      <button
        className={className}
        type="button"
        onClick={getDirections}
        disabled={isLocating}
      >
        <MapPinned aria-hidden="true" />
        {isLocating ? "Finding your location…" : "Route me to the hotel"}
      </button>
      {locationError && (
        <p className="location-error" role="alert">
          {locationError}
        </p>
      )}
    </div>
  );
}
