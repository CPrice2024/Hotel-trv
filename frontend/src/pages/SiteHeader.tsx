import { translateText, useLanguage } from "../i18n/language";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { LanguageSelector } from "../components/LanguageSelector";

export function SiteHeader({ overlay = false }: { overlay?: boolean }) {
  useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className={`site-header${overlay ? "" : " site-header-light"}`}>
      <Link className="brand" to="/" aria-label={translateText("Ayele Degu International Hotel home")}>
        <span className="brand-mark" aria-hidden="true">{translateText("A")}</span>
        <span className="brand-name">{translateText("Ayele Degu ")}<span>{translateText("International Hotel")}</span></span>
      </Link>
      <button
        className="menu-toggle"
        type="button"
        aria-expanded={menuOpen}
        aria-controls="site-nav"
        aria-label={translateText(menuOpen ? "Close navigation menu" : "Open navigation menu")}
        onClick={() => setMenuOpen((open) => !open)}
      >
        {translateText(menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />)}
      </button>
      <nav className={`site-nav${menuOpen ? " is-open" : ""}`} id="site-nav" aria-label={translateText("Main navigation")}>
        <Link to="/rooms" onClick={() => setMenuOpen(false)}>{translateText("Rooms")}</Link>
        <Link to="/services" onClick={() => setMenuOpen(false)}>{translateText("Services")}</Link>
        <Link to="/#experience" onClick={() => setMenuOpen(false)}>{translateText("Experience")}</Link>
        <Link to="/contact" onClick={() => setMenuOpen(false)}>{translateText("Contact")}</Link>
        <Link to="/map" onClick={() => setMenuOpen(false)}>{translateText("Map")}</Link>
        <Link to="/#about" onClick={() => setMenuOpen(false)}>{translateText("Our story")}</Link>
        <Link to="/my-bookings" onClick={() => setMenuOpen(false)}>{translateText("My bookings")}</Link>
        <Link className="nav-cta" to="/booking" onClick={() => setMenuOpen(false)}>{translateText("Book Now ")}<ArrowUpRight aria-hidden="true" />
        </Link>
      </nav>
      <LanguageSelector />
    </header>
  );
}
