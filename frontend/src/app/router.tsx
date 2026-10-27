import { Suspense, lazy, useDeferredValue, useEffect, useRef, type ReactNode } from "react";
import { BrowserRouter, Route, Routes, useLocation, useNavigationType, type Location } from "react-router-dom";
import lottie from "lottie-web";
import loaderAnimation from "../assets/page-loader.json";
import { SupportChat } from "../components/guest/SupportChat";
import { translateText, useLanguage } from "../i18n/language";
import { useScrollReveal } from "../hooks/useScrollReveal";

const AdminPage = lazy(() =>
  import("../pages/AdminPage").then((module) => ({ default: module.AdminPage })),
);
const BookingPage = lazy(() =>
  import("../pages/BookingPage").then((module) => ({ default: module.BookingPage })),
);
const BookingResultPage = lazy(() =>
  import("../pages/BookingResultPage").then((module) => ({
    default: module.BookingResultPage,
  })),
);
const HomePage = lazy(() =>
  import("../pages/HomePage").then((module) => ({ default: module.HomePage })),
);
const RoomsPage = lazy(() =>
  import("../pages/public/RoomsPage").then((module) => ({ default: module.RoomsPage })),
);
const ServicesPage = lazy(() =>
  import("../pages/public/AmenitiesPage").then((module) => ({ default: module.AmenitiesPage })),
);
const ContactPage = lazy(() =>
  import("../pages/public/ContactPage").then((module) => ({ default: module.ContactPage })),
);
const MapPage = lazy(() =>
  import("../pages/public/MapPage").then((module) => ({ default: module.MapPage })),
);
const MyBookingsPage = lazy(() =>
  import("../pages/guest/MyBookingsPage").then((module) => ({
    default: module.MyBookingsPage,
  })),
);
const PaymentRequestPage = lazy(() => import("../pages/guest/PaymentRequestPage").then(module => ({ default: module.PaymentRequestPage })));

export function AppRouter() {
  return (
    <BrowserRouter>
      <NavigationPages />
      <GuestSupportChat />
    </BrowserRouter>
  );
}

function PageLoader() {
  useLanguage();
  const animationContainer = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!animationContainer.current) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const animation = lottie.loadAnimation({
      container: animationContainer.current,
      renderer: "svg",
      loop: true,
      autoplay: !reducedMotion.matches,
      animationData: structuredClone(loaderAnimation),
    });
    const updateMotion = () => {
      if (reducedMotion.matches) animation.goToAndStop(24, true);
      else animation.play();
    };
    updateMotion();
    reducedMotion.addEventListener("change", updateMotion);
    return () => {
      reducedMotion.removeEventListener("change", updateMotion);
      animation.destroy();
    };
  }, []);
  return (
    <div className="navigation-loader" role="status" aria-live="polite">
      <span className="navigation-loader-animation" ref={animationContainer} aria-hidden="true" />
      <span className="sr-only">{translateText("Loading page…")}</span>
    </div>
  );
}

function PageTransition({ children, location }: { children: ReactNode; location: Location }) {
  const root = useRef<HTMLDivElement>(null);
  const navigationType = useNavigationType();
  const marketingPage = ["/", "/rooms", "/services", "/contact"].includes(location.pathname);
  useScrollReveal(root, marketingPage);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (location.hash) {
        let id: string;
        try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
        document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
      } else if (navigationType !== "POP") {
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [location.key, location.hash, navigationType]);
  return <div ref={root} className={location.pathname.startsWith("/admin") ? undefined : "page-enter"}>{children}</div>;
}

function NavigationPages() {
  const location = useLocation();
  const displayedLocation = useDeferredValue(location);
  return (
    <>
      {location !== displayedLocation && <PageLoader />}
      <Suspense
        fallback={<PageLoader />}
      >
        <PageTransition key={displayedLocation.pathname} location={displayedLocation}>
        <Routes location={displayedLocation}>
          <Route path="/" element={<HomePage />} />
          <Route path="/rooms" element={<RoomsPage />} />
          <Route path="/services" element={<ServicesPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/booking" element={<BookingPage />} />
          <Route path="/booking/result" element={<BookingResultPage />} />
          <Route path="/booking/payment-request" element={<PaymentRequestPage />} />
          <Route path="/my-bookings" element={<MyBookingsPage />} />
          <Route path="/admin/*" element={<AdminPage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
        </PageTransition>
      </Suspense>
    </>
  );
}

function GuestSupportChat() {
  const location = useLocation();
  return location.pathname.startsWith("/admin") ? null : <SupportChat />;
}
