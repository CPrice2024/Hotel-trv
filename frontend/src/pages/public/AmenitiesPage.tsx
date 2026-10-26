import { translateText, useLanguage } from "../../i18n/language";
import { ArrowUpRight, Clock3, Dumbbell, MapPin, Plane, Sparkles, Utensils, Users, Waves } from "lucide-react";
import { Link } from "react-router-dom";
import { SiteHeader } from "../SiteHeader";
import "./RoomsAndServices.css";

const services = [
  {
    icon: Utensils,
    title: "Restaurant",
    detail: "Enjoy a meal at the hotel restaurant.",
    hours: "Open daily · 7:00 AM–10:00 PM",
  },
  {
    icon: Dumbbell,
    title: "Fitness center",
    detail: "Keep up your routine while you are away.",
    hours: "Open daily · 6:00 AM–10:00 PM",
  },
  {
    icon: Sparkles,
    title: "Spa",
    detail: "Take time to rest and recharge.",
    hours: "Open daily · 9:00 AM–8:00 PM",
  },
  {
    icon: Users,
    title: "Conference hall",
    detail: "A dedicated space for meetings and events.",
    hours: "Capacity · Up to 100 guests",
  },
  {
    icon: Plane,
    title: "Airport shuttle",
    detail: "Arrange transportation with the front desk.",
    hours: "Please arrange at least 24 hours ahead",
  },
  {
    icon: Waves,
    title: "Room service",
    detail: "Assistance and room service are available around the clock.",
    hours: "Available · 24/7",
  },
  {
    icon: MapPin,
    title: "Secure parking",
    detail: "Complimentary secure parking for hotel guests.",
    hours: "Available for guests",
  },
  {
    icon: Clock3,
    title: "Daily housekeeping",
    detail: "A little extra care to help you feel at home.",
    hours: "Daily service",
  },
];

export function AmenitiesPage() {
  useLanguage();
  return (
    <>
      <SiteHeader />
      <main className="catalog-page">
        <section className="catalog-hero services-hero">
          <p className="eyebrow">{translateText("A little more for your stay")}</p>
          <h1>{translateText("Thoughtful services.")}<br /><em>{translateText("Warm hospitality.")}</em></h1>
          <p>{translateText("From your first arrival to a well-earned moment of rest, we are here to make your visit easier.")}</p>
          <a className="button button-light" href="#service-list">{translateText("Explore services ")}<ArrowUpRight aria-hidden="true" />
          </a>
        </section>

        <section className="catalog-section section-wrap" id="service-list">
          <div className="catalog-intro">
            <div>
              <p className="eyebrow">{translateText("Here to help")}</p>
              <h2>{translateText("Make yourself ")}<em>{translateText("at home.")}</em></h2>
            </div>
            <p>{translateText("Explore the facilities and guest services listed by Ayele Degu International Hotel.")}</p>
          </div>

          <div className="service-list">
            {translateText(services.map(({ icon: Icon, title, detail, hours }) => (
              <article className="service-list-card" key={title}>
                <span className="service-list-icon"><Icon aria-hidden="true" /></span>
                <div>
                  <h3>{translateText(title)}</h3>
                  <p>{translateText(detail)}</p>
                  <span className="service-list-hours">{translateText(hours)}</span>
                </div>
              </article>
            )))}
          </div>
          <p className="service-confirmation-note">{translateText("Please contact the hotel to confirm availability, details, and any applicable charges before your visit.")}</p>
        </section>

        <section className="catalog-cta">
          <div className="section-wrap catalog-cta-inner">
            <div>
              <p className="eyebrow">{translateText("We look forward to welcoming you")}</p>
              <h2>{translateText("Plan a stay")}<br /><em>{translateText("that feels easy.")}</em></h2>
            </div>
            <div className="catalog-cta-actions">
              <Link className="button button-light" to="/booking">{translateText("Find your room ")}<ArrowUpRight aria-hidden="true" /></Link>
              <Link to="/#contact">{translateText("Get in touch")}</Link>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}