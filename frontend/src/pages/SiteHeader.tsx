import { ArrowUpRight, Menu, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

export function SiteHeader({ overlay = false }: { overlay?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className={`site-header${overlay ? "" : " site-header-light"}`}>
      <Link className="brand" to="/" aria-label="Ayele Degu International Hotel home">
        <span className="brand-mark" aria-hidden="true">A</span>
        <span className="brand-name">Ayele Degu <span>International Hotel</span></span>
      </Link>
      <button
        className="menu-toggle"
        type="button"
        aria-expanded={menuOpen}
        aria-controls="site-nav"
        aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
        onClick={() => setMenuOpen((open) => !open)}
      >
        {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
      </button>
      <nav className={`site-nav${menuOpen ? " is-open" : ""}`} id="site-nav" aria-label="Main navigation">
        <Link to="/rooms" onClick={() => setMenuOpen(false)}>Rooms</Link>
        <Link to="/services" onClick={() => setMenuOpen(false)}>Services</Link>
        <Link to="/#experience" onClick={() => setMenuOpen(false)}>Experience</Link>
        <Link to="/contact" onClick={() => setMenuOpen(false)}>Contact</Link>
        <Link to="/map" onClick={() => setMenuOpen(false)}>Map</Link>
        <Link to="/#about" onClick={() => setMenuOpen(false)}>Our story</Link>
        <Link to="/my-bookings" onClick={() => setMenuOpen(false)}>My bookings</Link>
        <Link className="nav-cta" to="/booking" onClick={() => setMenuOpen(false)}>
          Book Now <ArrowUpRight aria-hidden="true" />
        </Link>
      </nav>
    </header>
  );
}
