import { getLocale, translateText, useLanguage } from "../i18n/language";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ArrowUpRight, Landmark, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
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
import { addDateDays, DatePicker } from "../components/ui/date-picker";
import { RoomSelect } from "../components/ui/select";

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
  return new Intl.NumberFormat(getLocale(), {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "USD" ? 2 : 0,
  }).format(amount);
}

export function BookingPage() {
  useLanguage();
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
      roomId: "",
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
          <Link className="back-link" to="/"><ArrowLeft aria-hidden="true" />{translateText(" Back to the hotel")}</Link>
          <div className="page-heading">
            <p className="eyebrow">{translateText("A stay to look forward to")}</p>
            <h1>{translateText("Plan your ")}<em>{translateText("stay.")}</em></h1>
            <p>{translateText("Choose your dates and room. Your rooms are held temporarily while you complete payment.")}</p>
          </div>

          {translateText(roomsQuery.isLoading && <p>{translateText("Loading available room types…")}</p>)}
          {translateText(roomsQuery.isError && <p className="form-message">{translateText("Room options could not be loaded. Please refresh and try again.")}</p>)}
          {translateText(roomsQuery.data?.length === 0 && (
            <div className="empty-state">
              <h2>{translateText("Room options are being prepared.")}</h2>
              <p>{translateText("Please contact the hotel, or check back soon.")}</p>
              {translateText(configQuery.data?.email && <a className="button button-dark" href={`mailto:${configQuery.data.email}`}>{translateText("Email the hotel ")}<ArrowUpRight /></a>)}
            </div>
          ))}

          {translateText(!!roomsQuery.data?.length && !createdBooking && (
            <form className="booking-form" onSubmit={submitBooking}>
              <ol className="booking-stepper" aria-label={translateText("Booking progress")}>
                {translateText(bookingSteps.map((label, index) => (
                  <li className={step === index ? "is-current" : step > index ? "is-complete" : ""} key={label}>
                    <span>{translateText(index + 1)}</span>{translateText(label)}
                  </li>
                )))}
              </ol>

              {translateText(roomsQuery.data.some((room) => room.testOnly) && (
                <p className="form-message" role="status">{translateText("Some listings use test inventory. Confirm availability with the hotel before completing a live reservation.")}</p>
              ))}

              <div className="booking-price-controls">
                <div>
                  <span>{translateText("Indicative room price")}</span>
                  <strong aria-live="polite">{translateText(selectedRoom ? `${displayedNightlyPrice} / night` : "Choose a room to see its price")}</strong>
                  <small>{translateText(priceCurrency === "auto" ? "Auto follows your payment currency." : "Display currency only. Choose your payment method at checkout.")}</small>
                </div>
                <div className="price-currency-toggle" role="group" aria-label={translateText("Room price currency")}>
                  {translateText((["auto", "USD", "ETB"] as const).map((option) => (
                    <button key={option} type="button" aria-pressed={priceCurrency === option} onClick={() => setPriceCurrency(option)}>
                      {translateText(option === "auto" ? "Auto" : option === "ETB" ? "Birr" : "USD")}
                    </button>
                  )))}
                </div>
              </div>

              {translateText(step === 0 && (
                <section className="form-panel">
                  <h2>{translateText("Choose your room")}</h2>
                  <p className="payment-hint">{translateText("Select the room type you want before entering your stay details.")}</p>
                  <label className="field-label" htmlFor="roomId">{translateText("Room type")}</label>
                  <Controller name="roomId" control={form.control} render={({ field }) => (
                    <RoomSelect id="roomId" value={field.value} onChange={field.onChange} onBlur={field.onBlur}
                      invalid={!!submitError.roomId} options={roomsQuery.data.map((room) => {
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
                        return { value: room.id, label: room.name, price: roomEtbPrice, guests: room.maxGuests,
                          imageUrl: room.imageUrl ? getRoomImageUrl(room.imageUrl) : undefined };
                      })} />
                  )} />
                  {translateText(submitError.roomId && <span className="field-error">{translateText(submitError.roomId.message)}</span>)}
                  {translateText(selectedRoom && (
                    <div className="booking-selected-room">
                      <div>
                        <span className="eyebrow">{translateText("Selected room")}</span>
                        <h3>{translateText(selectedRoom.name)}</h3>
                        <p>{translateText(indicativeCurrency === "ETB" ? convertUsdPricesToEtb(selectedRoom.description, exchangeRateQuery.data?.rate) : selectedRoom.description)}</p>
                        <strong>{translateText(displayedNightlyPrice)} <small>{translateText("/ night")}</small></strong>
                      </div>
                      {translateText(selectedRoom.imageUrl && (
                        <img src={getRoomImageUrl(selectedRoom.imageUrl)} alt={translateText(selectedRoom.name)} />
                      ))}
                    </div>
                  ))}
                  {translateText(exchangeRateQuery.data && selectedRoom?.priceUSD ? (
                    <p className="price-rate-disclaimer">{translateText("Indicative conversion from the public USD/ETB rate, updated ")}{translateText(formatRateTimestamp(exchangeRateQuery.data.updatedAt))}{translateText(" UTC. Final checkout uses the chosen payment currency and its confirmed room rate.")}</p>
                  ) : exchangeRateQuery.isError && selectedRoom?.priceUSD ? (
                    <p className="price-rate-error" role="status">{translateText("Birr estimate unavailable; try again later.")}</p>
                  ) : null)}
                  <div className="booking-step-actions">
                    <button className="button button-dark" type="button" onClick={() => void advanceStep()}>{translateText("Continue to dates ")}<ArrowRight aria-hidden="true" />
                    </button>
                  </div>
                </section>
              ))}

              {translateText(step === 1 && (
                <section className="form-panel">
                  <h2>{translateText("Choose your dates and guests")}</h2>
                  {translateText(selectedRoom && (
                    <div className="booking-room-summary">
                      <div><span>{translateText("Selected room")}</span><strong>{translateText(selectedRoom.name)}</strong><b>{translateText(displayedNightlyPrice)}{translateText(" / night")}</b></div>
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
                      >{translateText("Back to change room")}</Link>
                    </div>
                  ))}
                  <div className="form-grid">
                    <div className="date-field"><label htmlFor="checkIn">{translateText("Check-in")}</label>
                      <Controller name="checkIn" control={form.control} render={({ field }) => (
                        <DatePicker id="checkIn" label={translateText("Check-in")} value={field.value} min={today}
                          invalid={!!submitError.checkIn} onBlur={field.onBlur} onChange={(date) => {
                            field.onChange(date);
                            const checkout = form.getValues("checkOut");
                            if (checkout && (checkout <= date || checkout > addDateDays(date, 60))) form.setValue("checkOut", "", { shouldDirty: true });
                          }} />
                      )} />
                      {submitError.checkIn && <span className="field-error">{translateText(submitError.checkIn.message)}</span>}
                    </div>
                    <div className="date-field"><label htmlFor="checkOut">{translateText("Check-out")}</label>
                      <Controller name="checkOut" control={form.control} render={({ field }) => (
                        <DatePicker id="checkOut" label={translateText("Check-out")} value={field.value}
                          min={addDateDays(form.watch("checkIn") || today, 1)}
                          max={form.watch("checkIn") ? addDateDays(form.watch("checkIn"), 60) : undefined}
                          invalid={!!submitError.checkOut} onBlur={field.onBlur} onChange={field.onChange} />
                      )} />
                      {submitError.checkOut && <span className="field-error">{translateText(submitError.checkOut.message)}</span>}
                    </div>
                    <label>{translateText("Rooms")}<input type="number" min="1" max="10" {...form.register("quantity", { valueAsNumber: true })} />{translateText(submitError.quantity && <span className="field-error">{translateText(submitError.quantity.message)}</span>)}</label>
                    <label>{translateText("Guests")}<input type="number" min="1" max="20" {...form.register("guests", { valueAsNumber: true })} />{translateText(submitError.guests && <span className="field-error">{translateText(submitError.guests.message)}</span>)}</label>
                  </div>
                  {translateText(nights > 0 && selectedRoom && (
                    <p className="booking-stay-summary">
                      {translateText(nights)} {translateText(nights === 1 ? "night" : "nights")}{translateText(" · ")}{translateText(form.watch("quantity"))} {translateText(form.watch("quantity") === 1 ? "room" : "rooms")}{translateText(" · ")}{translateText(form.watch("guests"))} {translateText(form.watch("guests") === 1 ? "guest" : "guests")}
                    </p>
                  ))}
                  <div className="booking-step-actions">
                    <button className="button button-outline" type="button" onClick={() => setStep(0)}>{translateText("Back")}</button>
                    <button className="button button-dark" type="button" onClick={() => void advanceStep()}>{translateText("Continue to guest details ")}<ArrowRight aria-hidden="true" />
                    </button>
                  </div>
                </section>
              ))}

              {translateText(step === 2 && (
                <section className="form-panel">
                  <h2>{translateText("Who is staying?")}</h2>
                  <div className="booking-room-summary">
                    <div>
                      <span>{translateText(selectedRoom?.name)}{translateText(" · ")}{translateText(nights)} {translateText(nights === 1 ? "night" : "nights")}</span>
                      <strong>{translateText(form.watch("checkIn"))}{translateText(" to ")}{translateText(form.watch("checkOut"))}</strong>
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
                    >{translateText("Back to change room")}</Link>
                  </div>
                  <div className="form-grid">
                    <label>{translateText("Full name")}<input autoComplete="name" {...form.register("guestName")} />{translateText(submitError.guestName && <span className="field-error">{translateText(submitError.guestName.message)}</span>)}</label>
                    <div className="guest-email-section">
                    <label>{translateText("Email for confirmation")}<input type="email" autoComplete="email" {...form.register("guestEmail")} />{translateText(submitError.guestEmail && <span className="field-error">{translateText(submitError.guestEmail.message)}</span>)}</label>
                    <div className="google-signup-panel" aria-busy={isVerifyingGoogle}>
                      <p>{translateText("Or use Google to fill in your verified email and name.")}</p>
                      {translateText(googleClientId && configQuery.data?.authenticationMethods?.google ? (
                        <div ref={googleButtonRef} className="google-signup-button" />
                      ) : (
                        <button className="google-signup-button google-signup-unavailable" type="button" disabled>
                          <span aria-hidden="true">{translateText("G")}</span>{translateText("Sign up with Google")}</button>
                      ))}
                      {translateText(isVerifyingGoogle && (
                        <p role="status">{translateText("Verifying your Google account…")}</p>
                      ))}
                      {translateText(verifiedGoogleEmail && form.watch("guestEmail") === verifiedGoogleEmail && (
                        <p className="google-verified" role="status">{translateText("Google email verified: ")}{translateText(verifiedGoogleEmail)}</p>
                      ))}
                      {translateText(googleSignInError && (
                        <p className="field-error" role="alert">{translateText(googleSignInError)}</p>
                      ))}
                      {translateText((!googleClientId || !configQuery.data?.authenticationMethods?.google) && (
                        <p>{translateText("Google sign-up is not configured yet. You can still enter your email above.")}</p>
                      ))}
                    </div>
                    </div>
                    <label>{translateText("Phone number")}<input type="tel" autoComplete="tel" {...form.register("guestPhone")} />{translateText(submitError.guestPhone && <span className="field-error">{translateText(submitError.guestPhone.message)}</span>)}</label>
                  </div>
                  <div className="booking-step-actions">
                    <button className="button button-outline" type="button" onClick={() => setStep(1)}>{translateText("Back")}</button>
                    <button className="button button-dark" type="button" disabled={isVerifyingGoogle} onClick={() => void advanceStep()}>{translateText("Review payment ")}<ArrowRight aria-hidden="true" />
                    </button>
                  </div>
                </section>
              ))}

              {translateText(step === 3 && (
                <section className="form-panel">
                  <h2>{translateText("Review and choose payment")}</h2>
                  <div className="booking-review">
                    <p><span>{translateText("Room")}</span><strong>{translateText(selectedRoom?.name)}</strong></p>
                    <p><span>{translateText("Stay")}</span><strong>{translateText(form.watch("checkIn"))}{translateText(" to ")}{translateText(form.watch("checkOut"))}{translateText(" · ")}{translateText(nights)} {translateText(nights === 1 ? "night" : "nights")}</strong></p>
                    <p><span>{translateText("Guests and rooms")}</span>                    <strong>{translateText(form.watch("guests"))} {translateText(form.watch("guests") === 1 ? "guest" : "guests")}{translateText(" · ")}{translateText(form.watch("quantity"))} {translateText(form.watch("quantity") === 1 ? "room" : "rooms")}</strong></p>
                    <p><span>{translateText("Guest")}</span><strong>{translateText(form.watch("guestName"))}{translateText(" · ")}{translateText(form.watch("guestEmail"))}</strong></p>
                    <div className="indicative-price-row">
                      <div>
                        <span>{translateText("Indicative room price")}</span>
                        <strong>{translateText(displayedNightlyPrice)}{translateText(" / night")}</strong>
                      </div>

                    </div>
                    {translateText(nights > 0 && paymentNightlyRate > 0 && (
                      <p>
                        <span>{translateText("Estimated payment total")}</span>
                        <strong>{translateText(formatPaymentTotal(estimatedPaymentTotal, currency))}</strong>
                      </p>
                    ))}
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
                  >{translateText("Back to change room")}</Link>
                  <p className="payment-hint">{translateText("Choose a payment provider. Chapa uses a configured Birr room rate when available; otherwise the server converts the USD room rate using a current, validated exchange rate when your booking is held. Any Birr estimate shown here is confirmed when the room is held.")}</p>
                  <div className="currency-options" role="group" aria-label={translateText("Payment provider")}>
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
                        <strong className="payment-provider-name">{translateText("Chapa")}</strong>
                        <small>{translateText(chapaAvailable ? "Pay in Ethiopian Birr (ETB)" : "Currently unavailable")}</small>
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
                        <strong className="payment-provider-name">{translateText("stripe")}</strong>
                        <small>{translateText(stripeAvailable ? "Pay in US dollars (USD)" : "Currently unavailable")}</small>
                        <span className="payment-card-brands" aria-label={translateText("Card networks and issuer examples")}>
                          <span className="payment-card-badge payment-card-visa" aria-label={translateText("Visa")}>{translateText("VISA")}</span>
                          <span className="payment-card-badge payment-card-mastercard" aria-label={translateText("Mastercard")}>
                            <svg viewBox="0 0 48 30" aria-hidden="true"><circle cx="18" cy="15" r="12" fill="#eb001b" /><circle cx="30" cy="15" r="12" fill="#f79e1b" fillOpacity="0.88" /></svg>
                            <span className="sr-only">{translateText("Mastercard")}</span>
                          </span>
                          <span className="payment-card-badge payment-card-amex" aria-label={translateText("American Express")}>{translateText("AMEX")}</span>
                          <span className="payment-card-badge payment-card-bank" aria-label={translateText("Bank of America card issuer")}>
                            <Landmark aria-hidden="true" />
                            <span>{translateText("Bank of")}<br />{translateText("America")}</span>
                          </span>
                        </span>
                        <small>{translateText("Bank-issued cards use their card network. Available methods appear at checkout.")}</small>
                      </span>
                    </label>
                  </div>
                  {translateText(!configQuery.isLoading && !paymentEnabled && (
                    <p className="contact-note">
                      {translateText(!chapaAvailable && !stripeAvailable
                        ? "Online payment is unavailable for this room. Contact the hotel to complete your booking."
                        : "This checkout option is unavailable. Choose another available payment method or contact the hotel.")}
                    </p>
                  ))}
                  {translateText(pageError && <p className="form-message" role="alert">{translateText(pageError)}</p>)}
                  <div className="booking-step-actions">
                    <button className="button button-outline" type="button" onClick={() => setStep(2)}>{translateText("Back")}</button>
                    <button className={`button payment-submit payment-submit-${currency === "ETB" ? "chapa" : "stripe"}`} type="submit" disabled={form.formState.isSubmitting || !paymentEnabled}>
                      {translateText(form.formState.isSubmitting ? <><LoaderCircle className="spin" />{translateText(" Securing your booking…")}</> : <>{translateText("Hold room and pay with ")}{translateText(currency === "ETB" ? "Chapa" : "Stripe")} <ArrowUpRight aria-hidden="true" /></>)}
                    </button>
                  </div>
                </section>
              ))}

              {translateText(pageError && step < 3 && <p className="form-message" role="alert">{translateText(pageError)}</p>)}
            </form>
          ))}

          {translateText(createdBooking && (
            <section className="form-panel checkout-retry">
              <h2>{translateText("Booking hold created")}</h2>
              <p>{translateText(createdBooking.roomName)}{translateText(" · ")}{translateText(createdBooking.nights)}{translateText(" nights · ")}{translateText(formatPaymentTotal(createdBooking.total, createdBooking.currency))}</p>
              <p>{translateText("Finish payment before ")}{translateText(new Date(createdBooking.holdExpiresAt).toLocaleTimeString())}{translateText(" to keep this room hold.")}</p>
              {translateText(pageError && <p className="form-message" role="alert">{translateText(pageError)}</p>)}
              <button className="button button-dark" type="button" onClick={() => void beginCheckout(createdBooking, form.getValues("guestEmail"))}>{translateText("Continue to payment ")}<ArrowUpRight aria-hidden="true" />
              </button>
            </section>
          ))}
        </div>
      </main>
      <footer className="site-footer"><Link className="brand footer-brand" to="/">{translateText("Ayele Degu International Hotel")}</Link><p>{translateText("Birr room prices are indicative. Final payment is charged in the currency and rate selected for checkout.")}</p></footer>
    </>
  );
}
