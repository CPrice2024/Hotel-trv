import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUpRight, MapPin, Sparkles } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useLocation } from "react-router-dom";
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
  const location = useLocation();
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

  useEffect(() => {
    const targetId = location.hash.slice(1);
    if (!targetId) return;

    const frame = window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [location.hash]);

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
      <a className="skip-link" href="#main">Skip to content</a>
      <SiteHeader overlay />
      <main id="main">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-photo" role="img" aria-label="A calm, warmly lit hotel interior" />
          <div className="hero-shade" />
          <div className="hero-content">
            <p className="eyebrow hero-eyebrow"><span /> A warm welcome awaits</p>
            <h1 id="hero-title">Make room<br />for <em>something</em><br />beautiful.</h1>
            <p className="hero-copy">A thoughtful place to pause, connect, and feel at home—wherever your journey takes you.</p>
            <a className="button button-light" href="#stay">Discover your stay <ArrowDown aria-hidden="true" /></a>
            <a className="hero-book-link" href="/booking">Check availability <ArrowUpRight aria-hidden="true" /></a>
          </div>
          <div className="hero-note"><span>01</span> {config?.name ?? "Ayele Degu International Hotel"}</div>
        </section>

        <section className="intro section-wrap" id="about" aria-labelledby="intro-title">
          <div className="intro-label">
            <span className="eyebrow">A place to belong</span>
            <Sparkles className="ornament" aria-hidden="true" />
          </div>
          <div className="intro-copy">
            <h2 id="intro-title">Travel brings us together.<br /><em>Hospitality makes it feel like home.</em></h2>
            <p>Whether you’re here for a moment or a little longer, we believe the best stays are made of thoughtful details, genuine care, and space to make the experience your own.</p>
          </div>
        </section>

        <section className="stay-section" id="stay" aria-labelledby="stay-title">
          <div className="section-wrap">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Find your kind of stay</p>
                <h2 id="stay-title">Settle in <em>beautifully.</em></h2>
              </div>
              <p className="heading-aside">Comfort for the everyday.<br />Space for the exceptional.</p>
            </div>
            <div className="stay-grid">
              {roomsQuery.data?.map((room, index) => (
                <article className="stay-card" key={room.id}>
                  {room.imageUrl && <img className="stay-image" src={getRoomImageUrl(room.imageUrl)} alt={room.name} loading="lazy" decoding="async" />}
                  <div className="stay-card-body">
                    <span className="card-number">{String(index + 1).padStart(2, "0")} / STAY</span>
                    <h3>{room.name}</h3>
                    <p className="room-rate">
                      {room.priceUSD > 0 && exchangeRateQuery.data
                        ? formatEtb(room.priceUSD * exchangeRateQuery.data.rate)
                        : room.priceUSD > 0 && exchangeRateQuery.isLoading
                          ? "Loading Birr price…"
                        : room.priceUSD <= 0 && room.priceETB > 0
                          ? formatEtb(room.priceETB)
                          : "Birr price unavailable"}
                      <span> / night</span>
                    </p>
                    {room.priceUSD > 0 && exchangeRateQuery.data && (
                      <span className="price-rate-note">
                        Indicative exchange rate · updated {formatRateTimestamp(exchangeRateQuery.data.updatedAt)} UTC
                      </span>
                    )}
                    {room.priceUSD > 0 && exchangeRateQuery.isError && (
                      <span className="price-rate-error" role="status">Birr estimate unavailable right now.</span>
                    )}
                    {room.testOnly && <span className="test-data-badge">Local test inventory</span>}
                    <p>{convertUsdPricesToEtb(room.description, exchangeRateQuery.data?.rate)}</p>
                    <a className="text-link" href={`/booking?roomId=${encodeURIComponent(room.id)}`}>Book this room <ArrowUpRight aria-hidden="true" /></a>
                  </div>
                </article>
              ))}
              {roomsQuery.isLoading && <p role="status">Loading room options…</p>}
              {roomsQuery.isError && <p className="form-message">Room details could not be loaded. Please try again later.</p>}
              {roomsQuery.data?.length === 0 && <p>No room options are available right now. Please contact the hotel.</p>}
            </div>
            {exchangeRateQuery.data && (
              <p className="price-rate-disclaimer">
                Birr prices are indicative conversions from the public USD/ETB rate, updated {formatRateTimestamp(exchangeRateQuery.data.updatedAt)} UTC. The final charge uses the payment currency and room rate confirmed at checkout.
              </p>
            )}
            {exchangeRateQuery.isError && (
              <p className="price-rate-disclaimer price-rate-error" role="status">
                The current Birr estimate could not be loaded. Please try again later or contact the hotel for pricing.
              </p>
            )}
            <div className="stay-book-row">
              <p>Ready when you are.</p>
              <a className="button button-dark" href="/booking">Check dates and rooms <ArrowUpRight aria-hidden="true" /></a>
            </div>
          </div>
        </section>

        <section className="services-section section-wrap" id="services" aria-labelledby="services-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Thoughtful facilities</p>
              <h2 id="services-title">Here to make your stay <em>easier.</em></h2>
            </div>
            <p className="heading-aside">Dining, wellness, meetings<br />and help along the way.</p>
          </div>
          <div className="services-grid">
            {hotelServices.map((service) => (
              <article className="service-card" key={service.title}>
                <h3>{service.title}</h3>
                <p>{service.description}</p>
              </article>
            ))}
          </div>
          <p className="services-note">
            Breakfast and extra beds are listed as available features; confirm inclusions and charges when booking.
            Extra bed: {exchangeRateQuery.data ? formatEtb(20 * exchangeRateQuery.data.rate) : "price available on request"}.
          </p>
          <p className="services-location">Located in Dilla Town, in Ethiopia’s Gedeo Zone.</p>
        </section>

        <section className="experience-section" id="experience" aria-labelledby="experience-title">
          <img className="experience-image" src="https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1200&q=85" alt="A welcoming hotel entrance in the evening" loading="lazy" />
          <div className="experience-copy">
            <p className="eyebrow">The feeling stays with you</p>
            <h2 id="experience-title">Good stays are<br /><em>made of moments.</em></h2>
            <p>It’s the ease of arriving. The comfort of settling in. The feeling that someone thought of the little things. We’re here to make every part of your visit feel a little more special.</p>
            <a className="button button-dark" href="/booking">Let’s make a plan <ArrowUpRight aria-hidden="true" /></a>
          </div>
        </section>

        <section className="contact-section section-wrap" id="contact" aria-labelledby="contact-title">
          <div>
            <p className="eyebrow">Start with a hello</p>
            <h2 id="contact-title">Your next stay<br />starts <em>right here.</em></h2>
            <div className="hotel-contact-details">
              {config?.email && <a href={`mailto:${config.email}`}>{config.email}</a>}
              {config?.phone && <a href={`tel:${config.phone}`}>{config.phone}</a>}
              {config?.address && <p><MapPin aria-hidden="true" />{config.address}</p>}
              {config?.directionsUrl && <a className="text-link" href={config.directionsUrl} target="_blank" rel="noreferrer">Get directions <ArrowUpRight aria-hidden="true" /></a>}
              {!config?.address && <p className="contact-note">Hotel address and map directions will appear here once configured.</p>}
            </div>
          </div>
          <form className="contact-form" onSubmit={submitContact}>
            <p>Have a question or planning a visit? Send our team a message.</p>
            <label>Name<input autoComplete="name" {...contactForm.register("name")} /></label>
            <label>Email<input type="email" autoComplete="email" {...contactForm.register("email")} /></label>
            <label>How can we help?<textarea rows={4} {...contactForm.register("message")} /></label>
            {contactForm.formState.errors.root && <p className={contactForm.formState.errors.root.type === "success" ? "form-message success-message" : "form-message"}>{contactForm.formState.errors.root.message}</p>}
            <button className="button button-dark" type="submit" disabled={contactForm.formState.isSubmitting}>
              {contactForm.formState.isSubmitting ? "Sending…" : "Send enquiry"} <ArrowUpRight aria-hidden="true" />
            </button>
            <span className="form-hint">Your message is emailed directly to the hotel team.</span>
          </form>
        </section>
      </main>

      <footer className="site-footer">
        <a className="brand footer-brand" href="/">
          <span className="brand-mark" aria-hidden="true">A</span>
          <span className="brand-name">{config?.name ?? "Ayele Degu"} <span>International Hotel</span></span>
        </a>
        <p>Thoughtful stays. Genuine welcome.</p>
        <span className="copyright">© {new Date().getFullYear()} {config?.name ?? "Ayele Degu International Hotel"}</span>
      </footer>
    </>
  );
}
