import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ArrowUpRight, Landmark, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { api, getErrorMessage, type HotelConfig, type Room } from "../api";
import {
  convertUsdPricesToEtb,
  formatEtb,
  formatRateTimestamp,
  useUsdToEtbRate,
} from "../hooks/useUsdToEtbRate";
import { rememberActiveBooking } from "../lib/guestBookings";
import { getRoomImageUrl } from "../lib/roomImage";
import { SiteHeader } from "./SiteHeader";

const bookingSchema = z.object({
  roomId: z.string().min(1, "Choose a room."),
  checkIn: z.string().min(1, "Choose a check-in date."),
  checkOut: z.string().min(1, "Choose a check-out date."),
  quantity: z.number().int().min(1).max(10),
  guests: z.number().int().min(1).max(20),
  guestName: z.string().trim().min(2, "Enter your name.").max(100),
  guestEmail: z.string().email("Enter a valid email.").max(254),
  guestPhone: z.string().trim().min(7, "Enter a valid phone number.").max(30),
});
type BookingFields = z.infer<typeof bookingSchema>;
type Currency = "ETB" | "USD";
type BookingDraft = Pick<BookingFields, "checkIn" | "checkOut" | "quantity" | "guests">;

interface GoogleCredentialResponse {
  credential: string;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string;
            callback: (response: GoogleCredentialResponse) => void;
            ux_mode: "popup";
          }) => void;
          renderButton: (
            element: HTMLElement,
            options: {
              type: "standard";
              theme: "outline";
              size: "large";
              text: "signup_with";
              shape: "rectangular";
              width: number;
            },
          ) => void;
        };
      };
    };
  }
}

interface CreatedBooking {
  id: string;
  roomName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  quantity: number;
  currency: Currency;
  total: number;
  usdToEtbRate: number | null;
  holdExpiresAt: string;
}

const today = (() => {
  const date = new Date();
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
})();

const bookingSteps = ["Room", "Stay", "Guest", "Payment"];

function getBookingDraft(state: unknown): Partial<BookingDraft> {
  if (typeof state !== "object" || state === null || !("bookingDraft" in state)) {
    return {};
  }
  const draft = state.bookingDraft;
  if (typeof draft !== "object" || draft === null) return {};

  return {
    checkIn: "checkIn" in draft && typeof draft.checkIn === "string" ? draft.checkIn : undefined,
    checkOut: "checkOut" in draft && typeof draft.checkOut === "string" ? draft.checkOut : undefined,
    quantity:
      "quantity" in draft &&
      typeof draft.quantity === "number" &&
      Number.isInteger(draft.quantity) &&
      draft.quantity >= 1 &&
      draft.quantity <= 10
        ? draft.quantity
        : undefined,
    guests:
      "guests" in draft &&
      typeof draft.guests === "number" &&
      Number.isInteger(draft.guests) &&
      draft.guests >= 1 &&
      draft.guests <= 20
        ? draft.guests
        : undefined,
  };
}

function formatPaymentTotal(amount: number, currency: Currency) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "USD" ? 2 : 0,
  }).format(amount);
}

export function BookingPage() {
  const [currency, setCurrency] = useState<Currency>("USD");
  const [priceCurrency, setPriceCurrency] = useState<Currency | "auto">("auto");
  const indicativeCurrency = priceCurrency === "auto" ? currency : priceCurrency;
  const [verifiedGoogleEmail, setVerifiedGoogleEmail] = useState("");
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const [googleSignInError, setGoogleSignInError] = useState("");
  const [isVerifyingGoogle, setIsVerifyingGoogle] = useState(false);
  const [step, setStep] = useState(0);
  const [createdBooking, setCreatedBooking] = useState<CreatedBooking | null>(null);
  const [pageError, setPageError] = useState("");
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const requestedRoomId = searchParams.get("roomId");
  const bookingDraft = getBookingDraft(location.state);
  const roomsQuery = useQuery({
    queryKey: ["rooms"],
    queryFn: async () => (await api.get<{ rooms: Room[] }>("/rooms")).data.rooms,
  });
  const configQuery = useQuery({
    queryKey: ["hotel-config"],
    queryFn: async () => (await api.get<HotelConfig>("/public/config")).data,
  });
  const googleClientId = configQuery.data?.authenticationMethods?.googleClientId ||
    import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || "";
  const exchangeRateQuery = useUsdToEtbRate();
  const form = useForm<BookingFields>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      quantity: bookingDraft.quantity ?? 1,
      guests: bookingDraft.guests ?? 1,
      checkIn: bookingDraft.checkIn ?? "",
      checkOut: bookingDraft.checkOut ?? "",
      guestName: "",
      guestEmail: "",
      guestPhone: "",
    },
  });
  const selectedRoomId = form.watch("roomId");
  const selectedRoom = roomsQuery.data?.find((room) => room.id === selectedRoomId);

  useEffect(() => {
    if (
      !googleClientId ||
      !configQuery.data?.authenticationMethods?.google ||
      step !== 2 ||
      !googleButtonRef.current
    ) {
      return;
    }

    let active = true;
    const buttonContainer = googleButtonRef.current;
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]',
    );

    const initializeGoogleSignIn = () => {
      if (!active || !window.google || !buttonContainer) return;
      buttonContainer.replaceChildren();
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        ux_mode: "popup",
        callback: async ({ credential }) => {
          if (!active) return;
          setIsVerifyingGoogle(true);
          setGoogleSignInError("");
          try {
            const { data } = await api.post<{ email: string; name: string }>(
              "/guest/google/verify",
              { credential },
            );
            if (!active) return;
            form.setValue("guestEmail", data.email, {
              shouldDirty: true,
              shouldValidate: true,
            });
            setVerifiedGoogleEmail(data.email);
            if (data.name) {
              form.setValue("guestName", data.name, {
                shouldDirty: true,
                shouldValidate: true,
              });
            }
          } catch (error) {
            if (active) {
              setGoogleSignInError(
                getErrorMessage(error, "Google sign-in could not be verified. Try again."),
              );
            }
          } finally {
            if (active) setIsVerifyingGoogle(false);
          }
        },
      });
      window.google.accounts.id.renderButton(buttonContainer, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "signup_with",
        shape: "rectangular",
        width: 280,
      });
    };

    if (window.google) {
      initializeGoogleSignIn();
    } else if (existingScript) {
      existingScript.addEventListener("load", initializeGoogleSignIn);
      existingScript.addEventListener("error", () => {
        if (active) setGoogleSignInError("Google sign-in could not load. Please use email instead.");
      });
    } else {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = initializeGoogleSignIn;
      script.onerror = () => {
        if (active) setGoogleSignInError("Google sign-in could not load. Please use email instead.");
      };
      document.head.appendChild(script);
    }

    return () => {
      active = false;
      existingScript?.removeEventListener("load", initializeGoogleSignIn);
    };
  }, [configQuery.data?.authenticationMethods?.google, form, googleClientId, step]);

  useEffect(() => {
    if (!requestedRoomId || !roomsQuery.data) return;
    const room = roomsQuery.data.find((item) => item.id === requestedRoomId);
    if (room) {
      form.setValue("roomId", room.id, { shouldValidate: true });
      setStep(1);
    } else {
      form.setError("roomId", {
        type: "manual",
        message: "That room type is no longer available. Choose another room.",
      });
      setStep(0);
    }
  }, [form, requestedRoomId, roomsQuery.data]);

  const beginCheckout = async (booking: CreatedBooking, guestEmail: string) => {
    setPageError("");
    try {
      rememberActiveBooking(booking.id, guestEmail);
      const { data } = await api.post<{ checkoutUrl: string }>("/payments/checkout", {
        bookingId: booking.id,
        guestEmail,
      });
      window.location.assign(data.checkoutUrl);
    } catch (error) {
      setPageError(getErrorMessage(error, "Could not start checkout. Please try again."));
    }
  };

  const submitBooking = form.handleSubmit(async (fields) => {
    setPageError("");
    if (fields.checkIn < today || fields.checkOut <= fields.checkIn) {
      setPageError("Check-out must be after check-in, and check-in cannot be in the past.");
      return;
    }
    const room = roomsQuery.data?.find((item) => item.id === fields.roomId);
    if (!room) {
      setPageError("Choose a room type to continue.");
      return;
    }
    if (
      (currency === "ETB" && !configQuery.data?.paymentMethods.chapa) ||
      (currency === "USD" && !configQuery.data?.paymentMethods.stripe)
    ) {
      setPageError(`${currency} online payments are not configured yet. Please contact the hotel.`);
      return;
    }
    try {
      const { data } = await api.post<{ booking: CreatedBooking }>("/bookings", {
        ...fields,
        currency,
      });
      setCreatedBooking(data.booking);
      await beginCheckout(data.booking, fields.guestEmail);
    } catch (error) {
      setPageError(getErrorMessage(error, "We could not hold those dates. Please try again."));
    }
  });

  const advanceStep = async () => {
    if (isVerifyingGoogle) return;
    setPageError("");
    const fieldsByStep: Array<(keyof BookingFields)[]> = [
      ["roomId"],
      ["checkIn", "checkOut", "quantity", "guests"],
      ["guestName", "guestEmail", "guestPhone"],
    ];
    const fields = fieldsByStep[step];
    if (fields && !(await form.trigger(fields))) return;

    if (step === 1) {
      const { checkIn, checkOut, guests, quantity } = form.getValues();
      if (checkIn < today || checkOut <= checkIn) {
        setPageError("Check-out must be after check-in, and check-in cannot be in the past.");
        return;
      }
      const stayNights =
        (Date.parse(`${checkOut}T00:00:00`) - Date.parse(`${checkIn}T00:00:00`)) /
        86_400_000;
      if (stayNights > 60) {
        setPageError("A stay cannot exceed 60 nights. Contact the hotel for longer stays.");
        return;
      }
      if (selectedRoom && guests > selectedRoom.maxGuests * quantity) {
        setPageError(
          `This room accommodates up to ${selectedRoom.maxGuests} guests per room.`,
        );
        return;
      }
    }

    if (step < bookingSteps.length - 1) setStep((current) => current + 1);
  };

  const submitError = form.formState.errors;
  const chapaAvailable = Boolean(
    selectedRoom &&
      (selectedRoom.priceETB > 0 || selectedRoom.priceUSD > 0) &&
      configQuery.data?.paymentMethods.chapa,
  );
  const stripeAvailable = Boolean(
    selectedRoom &&
      selectedRoom.priceUSD > 0 &&
      configQuery.data?.paymentMethods.stripe,
  );
  const paymentEnabled =
    currency === "ETB"
      ? chapaAvailable
      : stripeAvailable;
  useEffect(() => {
    if (currency === "ETB" && !chapaAvailable && stripeAvailable) {
      setCurrency("USD");
    } else if (currency === "USD" && !stripeAvailable && chapaAvailable) {
      setCurrency("ETB");
    }
  }, [chapaAvailable, currency, stripeAvailable]);
  const nights =
    form.watch("checkIn") && form.watch("checkOut") > form.watch("checkIn")
      ? Math.round(
          (Date.parse(`${form.watch("checkOut")}T00:00:00`) -
            Date.parse(`${form.watch("checkIn")}T00:00:00`)) /
            86_400_000,
        )
      : 0;
  const displayedNightlyPrice = selectedRoom
    ? indicativeCurrency === "ETB"
      ? selectedRoom.priceETB > 0
        ? formatEtb(selectedRoom.priceETB)
        : selectedRoom.priceUSD > 0 && exchangeRateQuery.data
          ? formatEtb(selectedRoom.priceUSD * exchangeRateQuery.data.rate)
          : "Birr estimate unavailable"
      : selectedRoom.priceUSD > 0
        ? formatPaymentTotal(selectedRoom.priceUSD, "USD")
        : selectedRoom.priceETB > 0 && exchangeRateQuery.data
          ? formatPaymentTotal(selectedRoom.priceETB / exchangeRateQuery.data.rate, "USD")
          : "USD estimate unavailable"
    : "";
  const paymentNightlyRate = selectedRoom
    ? currency === "ETB"
      ? selectedRoom.priceETB ||
        (exchangeRateQuery.data
          ? Math.round(selectedRoom.priceUSD * exchangeRateQuery.data.rate)
          : 0)
      : selectedRoom.priceUSD
    : 0;
  const estimatedPaymentTotal =
    paymentNightlyRate * nights * (form.watch("quantity") || 1);

  return (
    <>
      <SiteHeader />
      <main className="app-page">
        <div className="section-wrap">
          <Link className="back-link" to="/"><ArrowLeft aria-hidden="true" /> Back to the hotel</Link>
          <div className="page-heading">
            <p className="eyebrow">A stay to look forward to</p>
            <h1>Plan your <em>stay.</em></h1>
            <p>Choose your dates and room. Your rooms are held temporarily while you complete payment.</p>
          </div>

          {roomsQuery.isLoading && <p>Loading available room types…</p>}
          {roomsQuery.isError && <p className="form-message">Room options could not be loaded. Please refresh and try again.</p>}
          {roomsQuery.data?.length === 0 && (
            <div className="empty-state">
              <h2>Room options are being prepared.</h2>
              <p>Please contact the hotel, or check back soon.</p>
              {configQuery.data?.email && <a className="button button-dark" href={`mailto:${configQuery.data.email}`}>Email the hotel <ArrowUpRight /></a>}
            </div>
          )}

          {!!roomsQuery.data?.length && !createdBooking && (
            <form className="booking-form" onSubmit={submitBooking}>
              <ol className="booking-stepper" aria-label="Booking progress">
                {bookingSteps.map((label, index) => (
                  <li className={step === index ? "is-current" : step > index ? "is-complete" : ""} key={label}>
                    <span>{index + 1}</span>{label}
                  </li>
                ))}
              </ol>

              {roomsQuery.data.some((room) => room.testOnly) && (
                <p className="form-message" role="status">
                  Some listings use test inventory. Confirm availability with the hotel before completing a live reservation.
                </p>
              )}

              <div className="booking-price-controls">
                <div>
                  <span>Indicative room price</span>
                  <strong aria-live="polite">{selectedRoom ? `${displayedNightlyPrice} / night` : "Choose a room to see its price"}</strong>
                  <small>{priceCurrency === "auto" ? "Auto follows your payment currency." : "Display currency only. Choose your payment method at checkout."}</small>
                </div>
                <div className="price-currency-toggle" role="group" aria-label="Room price currency">
                  {(["auto", "USD", "ETB"] as const).map((option) => (
                    <button key={option} type="button" aria-pressed={priceCurrency === option} onClick={() => setPriceCurrency(option)}>
                      {option === "auto" ? "Auto" : option === "ETB" ? "Birr" : "USD"}
                    </button>
                  ))}
                </div>
              </div>

              {step === 0 && (
                <section className="form-panel">
                  <h2>Choose your room</h2>
                  <p className="payment-hint">Select the room type you want before entering your stay details.</p>
                  <label className="field-label" htmlFor="roomId">Room type</label>
                  <select id="roomId" {...form.register("roomId")}>
                    <option value="">Select a room</option>
                    {roomsQuery.data.map((room) => {
                      const roomEtbPrice = indicativeCurrency === "USD"
                        ? room.priceUSD > 0 ? formatPaymentTotal(room.priceUSD, "USD") : "USD rate unavailable"
                        : room.priceETB > 0 ? formatEtb(room.priceETB)
                        : room.priceUSD > 0 && exchangeRateQuery.data
                          ? formatEtb(room.priceUSD * exchangeRateQuery.data.rate)
                          : room.priceUSD > 0 && exchangeRateQuery.isLoading
                            ? "Loading Birr price…"
                          : room.priceUSD <= 0 && room.priceETB > 0
                            ? formatEtb(room.priceETB)
                            : "Birr estimate unavailable";
                      return (
                        <option value={room.id} key={room.id}>
                          {room.name} · {roomEtbPrice} per night · up to {room.maxGuests} guests
                        </option>
                      );
                    })}
                  </select>
                  {submitError.roomId && <span className="field-error">{submitError.roomId.message}</span>}
                  {selectedRoom && (
                    <div className="booking-selected-room">
                      <div>
                        <span className="eyebrow">Selected room</span>
                        <h3>{selectedRoom.name}</h3>
                        <p>{indicativeCurrency === "ETB" ? convertUsdPricesToEtb(selectedRoom.description, exchangeRateQuery.data?.rate) : selectedRoom.description}</p>
                        <strong>{displayedNightlyPrice} <small>/ night</small></strong>
                      </div>
                      {selectedRoom.imageUrl && (
                        <img src={getRoomImageUrl(selectedRoom.imageUrl)} alt={selectedRoom.name} />
                      )}
                    </div>
                  )}
                  {exchangeRateQuery.data && selectedRoom?.priceUSD ? (
                    <p className="price-rate-disclaimer">
                      Indicative conversion from the public USD/ETB rate, updated {formatRateTimestamp(exchangeRateQuery.data.updatedAt)} UTC. Final checkout uses the chosen payment currency and its confirmed room rate.
                    </p>
                  ) : exchangeRateQuery.isError && selectedRoom?.priceUSD ? (
                    <p className="price-rate-error" role="status">Birr estimate unavailable; try again later.</p>
                  ) : null}
                  <div className="booking-step-actions">
                    <button className="button button-dark" type="button" onClick={() => void advanceStep()}>
                      Continue to dates <ArrowRight aria-hidden="true" />
                    </button>
                  </div>
                </section>
              )}

              {step === 1 && (
                <section className="form-panel">
                  <h2>Choose your dates and guests</h2>
                  {selectedRoom && (
                    <div className="booking-room-summary">
                      <div><span>Selected room</span><strong>{selectedRoom.name}</strong><b>{displayedNightlyPrice} / night</b></div>
                      <Link
                        to="/rooms"
                        state={{
                          bookingDraft: {
                            checkIn: form.getValues("checkIn"),
                            checkOut: form.getValues("checkOut"),
                            quantity: form.getValues("quantity"),
                            guests: form.getValues("guests"),
                          },
                        }}
                      >
                        Back to change room
                      </Link>
                    </div>
                  )}
                  <div className="form-grid">
                    <label>Check-in<input type="date" min={today} {...form.register("checkIn")} />{submitError.checkIn && <span className="field-error">{submitError.checkIn.message}</span>}</label>
                    <label>Check-out<input type="date" min={form.watch("checkIn") || today} {...form.register("checkOut")} />{submitError.checkOut && <span className="field-error">{submitError.checkOut.message}</span>}</label>
                    <label>Rooms<input type="number" min="1" max="10" {...form.register("quantity", { valueAsNumber: true })} />{submitError.quantity && <span className="field-error">{submitError.quantity.message}</span>}</label>
                    <label>Guests<input type="number" min="1" max="20" {...form.register("guests", { valueAsNumber: true })} />{submitError.guests && <span className="field-error">{submitError.guests.message}</span>}</label>
                  </div>
                  {nights > 0 && selectedRoom && (
                    <p className="booking-stay-summary">
                      {nights} {nights === 1 ? "night" : "nights"} · {form.watch("quantity")} {form.watch("quantity") === 1 ? "room" : "rooms"} · {form.watch("guests")} {form.watch("guests") === 1 ? "guest" : "guests"}
                    </p>
                  )}
                  <div className="booking-step-actions">
                    <button className="button button-outline" type="button" onClick={() => setStep(0)}>Back</button>
                    <button className="button button-dark" type="button" onClick={() => void advanceStep()}>
                      Continue to guest details <ArrowRight aria-hidden="true" />
                    </button>
                  </div>
                </section>
              )}

              {step === 2 && (
                <section className="form-panel">
                  <h2>Who is staying?</h2>
                  <div className="booking-room-summary">
                    <div>
                      <span>{selectedRoom?.name} · {nights} {nights === 1 ? "night" : "nights"}</span>
                      <strong>{form.watch("checkIn")} to {form.watch("checkOut")}</strong>
                    </div>
                    <Link
                      to="/rooms"
                      state={{
                        bookingDraft: {
                          checkIn: form.getValues("checkIn"),
                          checkOut: form.getValues("checkOut"),
                          quantity: form.getValues("quantity"),
                          guests: form.getValues("guests"),
                        },
                      }}
                    >
                      Back to change room
                    </Link>
                  </div>
                  <div className="form-grid">
                    <label>Full name<input autoComplete="name" {...form.register("guestName")} />{submitError.guestName && <span className="field-error">{submitError.guestName.message}</span>}</label>
                    <div className="guest-email-section">
                    <label>Email for confirmation<input type="email" autoComplete="email" {...form.register("guestEmail")} />{submitError.guestEmail && <span className="field-error">{submitError.guestEmail.message}</span>}</label>
                    <div className="google-signup-panel" aria-busy={isVerifyingGoogle}>
                      <p>Or use Google to fill in your verified email and name.</p>
                      {googleClientId && configQuery.data?.authenticationMethods?.google ? (
                        <div ref={googleButtonRef} className="google-signup-button" />
                      ) : (
                        <button className="google-signup-button google-signup-unavailable" type="button" disabled>
                          <span aria-hidden="true">G</span>
                          Sign up with Google
                        </button>
                      )}
                      {isVerifyingGoogle && (
                        <p role="status">Verifying your Google account…</p>
                      )}
                      {verifiedGoogleEmail && form.watch("guestEmail") === verifiedGoogleEmail && (
                        <p className="google-verified" role="status">Google email verified: {verifiedGoogleEmail}</p>
                      )}
                      {googleSignInError && (
                        <p className="field-error" role="alert">{googleSignInError}</p>
                      )}
                      {(!googleClientId || !configQuery.data?.authenticationMethods?.google) && (
                        <p>Google sign-up is not configured yet. You can still enter your email above.</p>
                      )}
                    </div>
                    </div>
                    <label>Phone number<input type="tel" autoComplete="tel" {...form.register("guestPhone")} />{submitError.guestPhone && <span className="field-error">{submitError.guestPhone.message}</span>}</label>
                  </div>
                  <div className="booking-step-actions">
                    <button className="button button-outline" type="button" onClick={() => setStep(1)}>Back</button>
                    <button className="button button-dark" type="button" disabled={isVerifyingGoogle} onClick={() => void advanceStep()}>
                      Review payment <ArrowRight aria-hidden="true" />
                    </button>
                  </div>
                </section>
              )}

              {step === 3 && (
                <section className="form-panel">
                  <h2>Review and choose payment</h2>
                  <div className="booking-review">
                    <p><span>Room</span><strong>{selectedRoom?.name}</strong></p>
                    <p><span>Stay</span><strong>{form.watch("checkIn")} to {form.watch("checkOut")} · {nights} {nights === 1 ? "night" : "nights"}</strong></p>
                    <p><span>Guests and rooms</span>                    <strong>{form.watch("guests")} {form.watch("guests") === 1 ? "guest" : "guests"} · {form.watch("quantity")} {form.watch("quantity") === 1 ? "room" : "rooms"}</strong></p>
                    <p><span>Guest</span><strong>{form.watch("guestName")} · {form.watch("guestEmail")}</strong></p>
                    <div className="indicative-price-row">
                      <div>
                        <span>Indicative room price</span>
                        <strong>{displayedNightlyPrice} / night</strong>
                      </div>

                    </div>
                    {nights > 0 && paymentNightlyRate > 0 && (
                      <p>
                        <span>Estimated payment total</span>
                        <strong>{formatPaymentTotal(estimatedPaymentTotal, currency)}</strong>
                      </p>
                    )}
                  </div>
                  <Link
                    className="booking-change-room"
                    to="/rooms"
                    state={{
                      bookingDraft: {
                        checkIn: form.getValues("checkIn"),
                        checkOut: form.getValues("checkOut"),
                        quantity: form.getValues("quantity"),
                        guests: form.getValues("guests"),
                      },
                    }}
                  >
                    Back to change room
                  </Link>
                  <p className="payment-hint">Choose a payment provider. Chapa uses a configured Birr room rate when available; otherwise the server converts the USD room rate using a current, validated exchange rate when your booking is held. Any Birr estimate shown here is confirmed when the room is held.</p>
                  <div className="currency-options" role="group" aria-label="Payment provider">
                    <label className={`currency-choice currency-choice-chapa${currency === "ETB" ? " selected" : ""}${chapaAvailable ? "" : " unavailable"}`}>
                      <input
                        type="radio"
                        name="currency"
                        value="ETB"
                        checked={currency === "ETB"}
                        disabled={!chapaAvailable}
                        onChange={() => setCurrency("ETB")}
                      />
                      <span>
                        <strong className="payment-provider-name">Chapa</strong>
                        <small>{chapaAvailable ? "Pay in Ethiopian Birr (ETB)" : "Currently unavailable"}</small>
                      </span>
                    </label>
                    <label className={`currency-choice currency-choice-stripe${currency === "USD" ? " selected" : ""}${stripeAvailable ? "" : " unavailable"}`}>
                      <input
                        type="radio"
                        name="currency"
                        value="USD"
                        checked={currency === "USD"}
                        disabled={!stripeAvailable}
                        onChange={() => setCurrency("USD")}
                      />
                      <span>
                        <strong className="payment-provider-name">stripe</strong>
                        <small>{stripeAvailable ? "Pay in US dollars (USD)" : "Currently unavailable"}</small>
                        <span className="payment-card-brands" aria-label="Card networks and issuer examples">
                          <span className="payment-card-badge payment-card-visa" aria-label="Visa">VISA</span>
                          <span className="payment-card-badge payment-card-mastercard" aria-label="Mastercard">
                            <svg viewBox="0 0 48 30" aria-hidden="true"><circle cx="18" cy="15" r="12" fill="#eb001b" /><circle cx="30" cy="15" r="12" fill="#f79e1b" fillOpacity="0.88" /></svg>
                            <span className="sr-only">Mastercard</span>
                          </span>
                          <span className="payment-card-badge payment-card-amex" aria-label="American Express">AMEX</span>
                          <span className="payment-card-badge payment-card-bank" aria-label="Bank of America card issuer">
                            <Landmark aria-hidden="true" />
                            <span>Bank of<br />America</span>
                          </span>
                        </span>
                        <small>Bank-issued cards use their card network. Available methods appear at checkout.</small>
                      </span>
                    </label>
                  </div>
                  {!configQuery.isLoading && !paymentEnabled && (
                    <p className="contact-note">
                      {!chapaAvailable && !stripeAvailable
                        ? "Online payment is unavailable for this room. Contact the hotel to complete your booking."
                        : "This checkout option is unavailable. Choose another available payment method or contact the hotel."}
                    </p>
                  )}
                  {pageError && <p className="form-message" role="alert">{pageError}</p>}
                  <div className="booking-step-actions">
                    <button className="button button-outline" type="button" onClick={() => setStep(2)}>Back</button>
                    <button className={`button payment-submit payment-submit-${currency === "ETB" ? "chapa" : "stripe"}`} type="submit" disabled={form.formState.isSubmitting || !paymentEnabled}>
                      {form.formState.isSubmitting ? <><LoaderCircle className="spin" /> Securing your booking…</> : <>Hold room and pay with {currency === "ETB" ? "Chapa" : "Stripe"} <ArrowUpRight aria-hidden="true" /></>}
                    </button>
                  </div>
                </section>
              )}

              {pageError && step < 3 && <p className="form-message" role="alert">{pageError}</p>}
            </form>
          )}

          {createdBooking && (
            <section className="form-panel checkout-retry">
              <h2>Booking hold created</h2>
              <p>{createdBooking.roomName} · {createdBooking.nights} nights · {formatPaymentTotal(createdBooking.total, createdBooking.currency)}</p>
              <p>Finish payment before {new Date(createdBooking.holdExpiresAt).toLocaleTimeString()} to keep this room hold.</p>
              {pageError && <p className="form-message" role="alert">{pageError}</p>}
              <button className="button button-dark" type="button" onClick={() => void beginCheckout(createdBooking, form.getValues("guestEmail"))}>
                Continue to payment <ArrowUpRight aria-hidden="true" />
              </button>
            </section>
          )}
        </div>
      </main>
      <footer className="site-footer"><Link className="brand footer-brand" to="/">Ayele Degu International Hotel</Link><p>Birr room prices are indicative. Final payment is charged in the currency and rate selected for checkout.</p></footer>
    </>
  );
}
