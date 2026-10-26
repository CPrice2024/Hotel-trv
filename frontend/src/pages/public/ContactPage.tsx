import { translateText, useLanguage } from "../../i18n/language";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Clock3,
  Mail,
  MapPin,
  Phone,
} from "lucide-react";
import { Link } from "react-router-dom";
import { api, type HotelConfig } from "../../api";
import { SiteHeader } from "../SiteHeader";
import "./RoomsAndServices.css";

const supportTeam = [
  {
    name: "Front desk",
    role: "Arrival and in-stay assistance",
    description: "Check-in coordination, room details, Wi‑Fi, and guest requests handled by our front office team.",
    image:
      "https://images.unsplash.com/photo-1556740749-887f6717d7e4?auto=format&fit=crop&w=900&q=80",
  },
  {
    name: "Reservations",
    role: "Planning and booking support",
    description: "Flexible stay planning, room upgrades, dates, and special arrangements for longer or group visits.",
    image:
      "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=900&q=80",
  },
  {
    name: "Concierge",
    role: "Local guidance and recommendations",
    description: "City tips, transport help, and itinerary ideas so your time in Dilla feels effortless.",
    image:
      "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=900&q=80",
  },
];

export function ContactPage() {
  useLanguage();
  const configQuery = useQuery({
    queryKey: ["hotel-config"],
    queryFn: async () => (await api.get<HotelConfig>("/public/config")).data,
  });

  const config = configQuery.data;
  const hotelName = config?.name ?? "Ayele Degu International Hotel";
  const hotelPhone = config?.phone ?? "+251-11-123-4567";
  const hotelEmail = config?.email ?? "test@gmail.com";
  const hotelAddress = config?.address ?? "Dilla Town, Gedeo Zone, Ethiopia";
  const directionsUrl = config?.directionsUrl ?? "https://maps.google.com/?q=Dilla%20Town%20Ethiopia";
  const mapEmbedUrl = `https://www.google.com/maps?q=${encodeURIComponent(hotelAddress)}&output=embed`;

  return (
    <>
      <SiteHeader />
      <main className="catalog-page contact-page">
        <section className="catalog-hero contact-hero">
          <div className="section-wrap contact-hero-inner">
            <div className="contact-hero-copy">
              <p className="eyebrow">{translateText("Need a hand?")}</p>
              <h1>{translateText("We’re here")}<br />
                <em>{translateText("for every stay.")}</em>
              </h1>
              <p>{translateText("Whether you’re planning ahead or need something during your visit, our team is ready to help with reservations, directions, local tips, and thoughtful service from arrival to departure.")}</p>
              <div className="contact-hero-actions">
                <a className="button button-light" href={`mailto:${hotelEmail}`}>{translateText("Email us ")}<ArrowUpRight aria-hidden="true" />
                </a>
                <a className="button button-light button-secondary" href={directionsUrl} target="_blank" rel="noreferrer">{translateText("Get directions")}</a>
              </div>
            </div>

            <div className="contact-hero-panel">
              <img
                src="https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=1200&q=80"
                alt={translateText("Hotel front desk and welcoming reception area")}
                loading="lazy"
              />
              <div className="contact-hero-panel-card">
                <span className="card-number">{translateText("24/7 SUPPORT")}</span>
                <strong>{translateText(hotelName)}</strong>
                <p>{translateText(hotelAddress)}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="section-wrap contact-support">
          <div className="catalog-intro">
            <div>
              <p className="eyebrow">{translateText("Support that feels personal")}</p>
              <h2>{translateText("Friendly help for")}<br />
                <em>{translateText("every moment")}</em>
              </h2>
            </div>
            <p>{translateText("From the first message to the final check-out, our team responds with warmth, clarity, and practical guidance.")}</p>
          </div>

          <div className="support-grid">
            {translateText(supportTeam.map((person) => (
              <article className="support-card" key={person.name}>
                <img src={person.image} alt={translateText(person.name)} loading="lazy" />
                <div className="support-card-body">
                  <span className="support-card-role">{translateText(person.role)}</span>
                  <h3>{translateText(person.name)}</h3>
                  <p>{translateText(person.description)}</p>
                </div>
              </article>
            )))}
          </div>
        </section>

        <section className="section-wrap contact-layout">
          <div className="contact-card">
            <div className="contact-methods">
              <div className="contact-item">
                <span className="contact-icon"><Phone aria-hidden="true" /></span>
                <div>
                  <span className="contact-label">{translateText("Call us")}</span>
                  <a href={`tel:${hotelPhone}`}>{translateText(hotelPhone)}</a>
                </div>
              </div>

              <div className="contact-item">
                <span className="contact-icon"><Mail aria-hidden="true" /></span>
                <div>
                  <span className="contact-label">{translateText("Email")}</span>
                  <a href={`mailto:${hotelEmail}`}>{translateText(hotelEmail)}</a>
                </div>
              </div>

              <div className="contact-item">
                <span className="contact-icon"><MapPin aria-hidden="true" /></span>
                <div>
                  <span className="contact-label">{translateText("Visit")}</span>
                  <p>{translateText(hotelAddress)}</p>
                </div>
              </div>

              <div className="contact-item">
                <span className="contact-icon"><Clock3 aria-hidden="true" /></span>
                <div>
                  <span className="contact-label">{translateText("Support hours")}</span>
                  <p>{translateText("Open daily, 24/7 front desk support")}</p>
                </div>
              </div>
            </div>

            <div className="contact-form-card">
              <p className="eyebrow">{translateText("Send a message")}</p>
              <h3>{translateText("Tell us how we can help.")}</h3>
              <form className="support-form" onSubmit={(event) => event.preventDefault()}>
                <label>{translateText("Name")}<input type="text" placeholder={translateText("Your name")} />
                </label>
                <label>{translateText("Email")}<input type="email" placeholder={translateText("you@example.com")} />
                </label>
                <label>{translateText("Message")}<textarea rows={5} placeholder={translateText("How can our team help you?")} />
                </label>
                <button className="button button-dark" type="submit">{translateText("Send enquiry ")}<ArrowUpRight aria-hidden="true" />
                </button>
              </form>
            </div>
          </div>

          <div className="map-card" id="hotel-map">
            <div className="map-card-header">
              <div>
                <p className="eyebrow">{translateText("Find us")}</p>
                <h3>{translateText("Easy to reach.")}</h3>
              </div>
              <Link className="button button-dark contact-map-route" to="/map">
                <MapPin aria-hidden="true" />{translateText(" Route me to the hotel ")}<ArrowUpRight aria-hidden="true" />
              </Link>
            </div>

            <div className="map-frame-wrap">
              <iframe
                title={translateText("Ayele Degu International Hotel location")}
                src={mapEmbedUrl}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>

            <div className="map-footer">
              <MapPin aria-hidden="true" />
              <span>{translateText(hotelAddress)}</span>
            </div>
          </div>
        </section>

        <section className="catalog-cta">
          <div className="section-wrap catalog-cta-inner">
            <div>
              <p className="eyebrow">{translateText("Ready when you are")}</p>
              <h2>{translateText("Let’s plan your")}<br />
                <em>{translateText("next visit.")}</em>
              </h2>
            </div>
            <div className="catalog-cta-actions">
              <Link className="button button-light" to="/booking">{translateText("Book your stay ")}<ArrowUpRight aria-hidden="true" />
              </Link>
              <a href={`tel:${hotelPhone}`}>
                <Phone aria-hidden="true" /> {translateText(hotelPhone)}
              </a>
              <a href={`mailto:${hotelEmail}`}>
                <Mail aria-hidden="true" /> {translateText(hotelEmail)}
              </a>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
