import { Suspense, lazy } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { SupportChat } from "../components/guest/SupportChat";

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

export function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense
        fallback={
          <div className="page-loading" role="status">
            Loading hotel website…
          </div>
        }
      >
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/rooms" element={<RoomsPage />} />
          <Route path="/services" element={<ServicesPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/booking" element={<BookingPage />} />
          <Route path="/booking/result" element={<BookingResultPage />} />
          <Route path="/my-bookings" element={<MyBookingsPage />} />
          <Route path="/admin/*" element={<AdminPage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </Suspense>
      <GuestSupportChat />
    </BrowserRouter>
  );
}

function GuestSupportChat() {
  const location = useLocation();
  return location.pathname.startsWith("/admin") ? null : <SupportChat />;
}
