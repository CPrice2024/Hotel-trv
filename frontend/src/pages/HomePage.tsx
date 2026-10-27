import { translateText, useLanguage } from "../i18n/language";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUpRight, MapPin, Sparkles } from "lucide-react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { z } from "zod";
import { api, getErrorMessage, type HotelConfig, type Room } from "../api";
import {
  convertUsdPricesToEtb,
  formatEtb,
  formatRateTimestamp,
  useUsdToEtbRate,
} from "../hooks/useUsdToEtbRate";
import { getRoomImageUrl } from "../lib/roomImage";
import { SiteHeader } from "./SiteHeader";

const contactSchema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(100),
  email: z.string().email("Enter a valid email address.").max(254),
  message: z.string().trim().min(10, "Please add a little more detail.").max(3000),
});
type ContactFields = z.infer<typeof contactSchema>;

const hotelServices = [
  { title: "Restaurant", description: "Open daily from 7:00 AM to 10:00 PM." },
  { title: "Fitness center", description: "Gym access, open from 6:00 AM to 10:00 PM." },
  { title: "Spa", description: "Wellness facilities open from 9:00 AM to 8:00 PM." },
  { title: "Conference hall", description: "Meeting and event space for up to 100 people." },
  { title: "Airport shuttle", description: "Arrange pickup with the front desk at least 24 hours ahead." },
  { title: "Secure parking", description: "Complimentary secure guest parking." },
  { title: "Guest services", description: "24/7 room service and daily housekeeping." },
];

export function HomePage() {
  useLanguage();
  const roomsQuery = useQuery({
    queryKey: ["rooms"],
    queryFn: async () => (await api.get<{ rooms: Room[] }>("/rooms")).data.rooms,
  });
  const configQuery = useQuery({
    queryKey: ["hotel-config"],
    queryFn: async () => (await api.get<HotelConfig>("/public/config")).data,
  });
  const exchangeRateQuery = useUsdToEtbRate();
  const config = configQuery.data;
  const contactForm = useForm<ContactFields>({
    resolver: zodResolver(contactSchema),
  });

  const submitContact = contactForm.handleSubmit(async (fields) => {
    try {
      await api.post("/contact", fields);
      contactForm.reset();
      contactForm.setError("root", {
        type: "success",
        message: "Thanks—your message has been sent.",
      });
    } catch (error) {
      contactForm.setError("root", {
        message: getErrorMessage(error, "We could not send your message. Please try again."),
      });
    }
  });

  return (
    <>
      <a className="skip-link" href="#main">{translateText("Skip to content")}</a>
      <SiteHeader overlay />
      <main id="main">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-photo" role="img" aria-label={translateText("A calm, warmly lit hotel interior")} />
          <div className="hero-shade" />
          <div className="hero-content">
            <p className="eyebrow hero-eyebrow"><span />{translateText(" A warm welcome awaits")}</p>
            <h1 id="hero-title">{translateText("Make room")}<br />{translateText("for ")}<em>{translateText("something")}</em><br />{translateText("beautiful.")}</h1>
            <p className="hero-copy">{translateText("A thoughtful place to pause, connect, and feel at home—wherever your journey takes you.")}</p>
            <a className="button button-light" href="#stay">{translateText("Discover your stay ")}<ArrowDown aria-hidden="true" /></a>
            <Link className="hero-book-link" to="/booking">{translateText("Check availability ")}<ArrowUpRight aria-hidden="true" /></Link>
          </div>
          <div className="hero-note"><span>{translateText("01")}</span> {translateText(config?.name ?? "Ayele Degu International Hotel")}</div>
        </section>

        <section className="intro section-wrap" id="about" aria-labelledby="intro-title" data-reveal>
          <div className="intro-label">
            <span className="eyebrow">{translateText("A place to belong")}</span>
            <Sparkles className="ornament" aria-hidden="true" />
          </div>
          <div className="intro-copy">
            <h2 id="intro-title">{translateText("Travel brings us together.")}<br /><em>{translateText("Hospitality makes it feel like home.")}</em></h2>
            <p>{translateText("Whether you’re here for a moment or a little longer, we believe the best stays are made of thoughtful details, genuine care, and space to make the experience your own.")}</p>
          </div>
        </section>

        <section className="stay-section" id="stay" aria-labelledby="stay-title">
          <div className="section-wrap">
            <div className="section-heading" data-reveal>
              <div>
                <p className="eyebrow">{translateText("Find your kind of stay")}</p>
                <h2 id="stay-title">{translateText("Settle in ")}<em>{translateText("beautifully.")}</em></h2>
              </div>
              <p className="heading-aside">{translateText("Comfort for the everyday.")}<br />{translateText("Space for the exceptional.")}</p>
            </div>
            <div className="stay-grid">
              {translateText(roomsQuery.data?.map((room, index) => (
                <article className="stay-card" key={room.id}>
                  {room.imageUrl && <div className="stay-image-wrap">
                    <img className="stay-image" src={getRoomImageUrl(room.imageUrl)} alt={translateText(room.name)} loading="lazy" decoding="async" />
                    <span className="stay-image-shade" aria-hidden="true" />
                  </div>}
                  <div className="stay-card-body">
                    <span className="card-number">{translateText(String(index + 1).padStart(2, "0"))}{translateText(" / STAY")}</span>
                    <h3>{translateText(room.name)}</h3>
                    <p className="room-rate">
                      {translateText(room.priceUSD > 0 && exchangeRateQuery.data
                        ? formatEtb(room.priceUSD * exchangeRateQuery.data.rate)
                        : room.priceUSD > 0 && exchangeRateQuery.isLoading
                          ? "Loading Birr price…"
                        : room.priceUSD <= 0 && room.priceETB > 0
                          ? formatEtb(room.priceETB)
                          : "Birr price unavailable")}
                      <span>{translateText(" / night")}</span>
                    </p>
                    {translateText(room.priceUSD > 0 && exchangeRateQuery.data && (
                      <span className="price-rate-note">{translateText("Indicative exchange rate · updated ")}{translateText(formatRateTimestamp(exchangeRateQuery.data.updatedAt))}{translateText(" UTC")}</span>
                    ))}
                    {translateText(room.priceUSD > 0 && exchangeRateQuery.isError && (
                      <span className="price-rate-error" role="status">{translateText("Birr estimate unavailable right now.")}</span>
                    ))}
                    {translateText(room.testOnly && <span className="test-data-badge">{translateText("Local test inventory")}</span>)}
                    <p>{translateText(convertUsdPricesToEtb(room.description, exchangeRateQuery.data?.rate))}</p>
                    <Link className="text-link" to={`/booking?roomId=${encodeURIComponent(room.id)}`}>{translateText("Book this room ")}<ArrowUpRight aria-hidden="true" /></Link>
                  </div>
                </article>
              )))}
              {translateText(roomsQuery.isLoading && <p role="status">{translateText("Loading room options…")}</p>)}
              {translateText(roomsQuery.isError && <p className="form-message">{translateText("Room details could not be loaded. Please try again later.")}</p>)}
              {translateText(roomsQuery.data?.length === 0 && <p>{translateText("No room options are available right now. Please contact the hotel.")}</p>)}
            </div>
            {translateText(exchangeRateQuery.data && (
              <p className="price-rate-disclaimer">{translateText("Birr prices are indicative conversions from the public USD/ETB rate, updated ")}{translateText(formatRateTimestamp(exchangeRateQuery.data.updatedAt))}{translateText(" UTC. The final charge uses the payment currency and room rate confirmed at checkout.")}</p>
            ))}
            {translateText(exchangeRateQuery.isError && (
              <p className="price-rate-disclaimer price-rate-error" role="status">{translateText("The current Birr estimate could not be loaded. Please try again later or contact the hotel for pricing.")}</p>
            ))}
            <div className="stay-book-row">
              <p>{translateText("Ready when you are.")}</p>
              <Link className="button button-dark" to="/booking">{translateText("Check dates and rooms ")}<ArrowUpRight aria-hidden="true" /></Link>
            </div>
          </div>
        </section>

        <section className="services-section section-wrap" id="services" aria-labelledby="services-title">
          <div className="section-heading" data-reveal>
            <div>
              <p className="eyebrow">{translateText("Thoughtful facilities")}</p>
              <h2 id="services-title">{translateText("Here to make your stay ")}<em>{translateText("easier.")}</em></h2>
            </div>
            <p className="heading-aside">{translateText("Dining, wellness, meetings")}<br />{translateText("and help along the way.")}</p>
          </div>
          <div className="services-grid">
            {translateText(hotelServices.map((service) => (
              <article className="service-card" key={service.title} data-reveal>
                <h3>{translateText(service.title)}</h3>
                <p>{translateText(service.description)}</p>
              </article>
            )))}
          </div>
          <p className="services-note">{translateText("Breakfast and extra beds are listed as available features; confirm inclusions and charges when booking. Extra bed: ")}{translateText(exchangeRateQuery.data ? formatEtb(20 * exchangeRateQuery.data.rate) : "price available on request")}{translateText(".")}</p>
          <p className="services-location">{translateText("Located in Dilla Town, in Ethiopia’s Gedeo Zone.")}</p>
        </section>

        <section className="experience-section" id="experience" aria-labelledby="experience-title">
          <img className="experience-image" src="https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1200&q=85" alt={translateText("A welcoming hotel entrance in the evening")} loading="lazy" />
          <div className="experience-copy">
            <p className="eyebrow">{translateText("The feeling stays with you")}</p>
            <h2 id="experience-title">{translateText("Good stays are")}<br /><em>{translateText("made of moments.")}</em></h2>
            <p>{translateText("It’s the ease of arriving. The comfort of settling in. The feeling that someone thought of the little things. We’re here to make every part of your visit feel a little more special.")}</p>
            <a className="button button-dark" href="/booking">{translateText("Let’s make a plan ")}<ArrowUpRight aria-hidden="true" /></a>
          </div>
        </section>

        <section className="contact-section section-wrap" id="contact" aria-labelledby="contact-title" data-reveal>
          <div>
            <p className="eyebrow">{translateText("Start with a hello")}</p>
            <h2 id="contact-title">{translateText("Your next stay")}<br />{translateText("starts ")}<em>{translateText("right here.")}</em></h2>
            <div className="hotel-contact-details">
              {translateText(config?.email && <a href={`mailto:${config.email}`}>{translateText(config.email)}</a>)}
              {translateText(config?.phone && <a href={`tel:${config.phone}`}>{translateText(config.phone)}</a>)}
              {translateText(config?.address && <p><MapPin aria-hidden="true" />{translateText(config.address)}</p>)}
              {translateText(config?.directionsUrl && <a className="text-link" href={config.directionsUrl} target="_blank" rel="noreferrer">{translateText("Get directions ")}<ArrowUpRight aria-hidden="true" /></a>)}
              {translateText(!config?.address && <p className="contact-note">{translateText("Hotel address and map directions will appear here once configured.")}</p>)}
            </div>
          </div>
          <form className="contact-form" onSubmit={submitContact}>
            <p>{translateText("Have a question or planning a visit? Send our team a message.")}</p>
            <label>{translateText("Name")}<input autoComplete="name" {...contactForm.register("name")} /></label>
            <label>{translateText("Email")}<input type="email" autoComplete="email" {...contactForm.register("email")} /></label>
            <label>{translateText("How can we help?")}<textarea rows={4} {...contactForm.register("message")} /></label>
            {translateText(contactForm.formState.errors.root && <p className={contactForm.formState.errors.root.type === "success" ? "form-message success-message" : "form-message"}>{translateText(contactForm.formState.errors.root.message)}</p>)}
            <button className="button button-dark" type="submit" disabled={contactForm.formState.isSubmitting}>
              {translateText(contactForm.formState.isSubmitting ? "Sending…" : "Send enquiry")} <ArrowUpRight aria-hidden="true" />
            </button>
            <span className="form-hint">{translateText("Your message is emailed directly to the hotel team.")}</span>
          </form>
        </section>
      </main>

      <footer className="site-footer">
        <a className="brand footer-brand" href="/">
          <span className="brand-mark" aria-hidden="true">{translateText("A")}</span>
          <span className="brand-name">{translateText(config?.name ?? "Ayele Degu")} <span>{translateText("International Hotel")}</span></span>
        </a>
        <p>{translateText("Thoughtful stays. Genuine welcome.")}</p>
        <span className="copyright">{translateText("© ")}{translateText(new Date().getFullYear())} {translateText(config?.name ?? "Ayele Degu International Hotel")}</span>
      </footer>
    </>
  );
}
