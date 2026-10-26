import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, BedDouble, Users } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { api, type HotelConfig, type Room } from "../../api";
import {
  convertUsdPricesToEtb,
  formatEtb,
  formatRateTimestamp,
  useUsdToEtbRate,
} from "../../hooks/useUsdToEtbRate";
import { getRoomImageUrl } from "../../lib/roomImage";
import { SiteHeader } from "../SiteHeader";
import "./RoomsAndServices.css";

export function RoomsPage() {
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
  const rooms = roomsQuery.data ?? [];

  return (
    <>
      <SiteHeader />
      <main className="catalog-page">
        <section className="catalog-hero rooms-hero">
          <p className="eyebrow">A room for every kind of stay</p>
          <h1>Find your place<br /><em>to unwind.</em></h1>
          <p>Thoughtful comforts, welcoming spaces, and a restful stay in Dilla.</p>
          <a className="button button-light" href="#room-list">
            Explore rooms <ArrowUpRight aria-hidden="true" />
          </a>
        </section>

        <section className="catalog-section section-wrap" id="room-list">
          <div className="catalog-intro">
            <div>
              <p className="eyebrow">Our rooms</p>
              <h2>Stay a little <em>more comfortably.</em></h2>
            </div>
            <p>Choose a room to see its current rate and start planning your visit.</p>
          </div>

          {roomsQuery.isLoading && <p className="catalog-message" role="status">Loading available rooms…</p>}
          {roomsQuery.isError && (
            <p className="catalog-message catalog-error" role="alert">
              We could not load room details right now. Please try again later or contact the hotel.
            </p>
          )}
          {!roomsQuery.isLoading && !roomsQuery.isError && rooms.length === 0 && (
            <p className="catalog-message">There are no rooms available to display right now. Please contact the hotel for assistance.</p>
          )}

          {rooms.length > 0 && (
            <div className="room-list">
              {rooms.map((room, index) => (
                <article className="room-list-card" key={room.id}>
                  {room.imageUrl ? (
                    <img
                      className="room-list-image"
                      src={getRoomImageUrl(room.imageUrl)}
                      alt={`${room.name} at Ayele Degu International Hotel`}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="room-list-image room-image-placeholder" aria-hidden="true">
                      <BedDouble />
                    </div>
                  )}
                  <div className="room-list-content">
                    <span className="card-number">{String(index + 1).padStart(2, "0")} / ROOM</span>
                    <h3>{room.name}</h3>
                    <p className="room-list-description">
                      {convertUsdPricesToEtb(room.description, exchangeRateQuery.data?.rate)}
                    </p>
                    <div className="room-list-facts">
                      <span><Users aria-hidden="true" /> Up to {room.maxGuests} guests</span>
                      <span><BedDouble aria-hidden="true" /> Room type</span>
                    </div>
                    <div className="room-list-bottom">
                      <div className="room-list-rates" aria-label="Listed nightly rates">
                        {room.priceUSD > 0 && exchangeRateQuery.data && (
                          <>
                            <span>{formatEtb(room.priceUSD * exchangeRateQuery.data.rate)}</span>
                            <small>/ night · indicative conversion</small>
                          </>
                        )}
                        {room.priceUSD > 0 && exchangeRateQuery.isLoading && (
                          <span>Loading Birr price…</span>
                        )}
                        {room.priceUSD > 0 && exchangeRateQuery.isError && (
                          <span className="price-rate-error">Birr estimate unavailable</span>
                        )}
                        {room.priceUSD <= 0 && room.priceETB > 0 && (
                          <>
                            <span>{formatEtb(room.priceETB)}</span>
                            <small>/ night</small>
                          </>
                        )}
                        {room.priceETB <= 0 && room.priceUSD <= 0 && <span>Contact us for current rates</span>}
                      </div>
                      {room.testOnly && <span className="test-data-badge">Local test inventory</span>}
                      <Link
                        className="button button-dark room-book-link"
                        to={`/booking?roomId=${encodeURIComponent(room.id)}`}
                        state={location.state}
                      >
                        Select room <ArrowUpRight aria-hidden="true" />
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
          {exchangeRateQuery.data && (
            <p className="price-rate-disclaimer">
              Birr prices are indicative conversions from the public USD/ETB rate, updated {formatRateTimestamp(exchangeRateQuery.data.updatedAt)} UTC. Your final charge uses the payment currency and room rate confirmed at checkout.
            </p>
          )}
        </section>

        <section className="catalog-cta">
          <div className="section-wrap catalog-cta-inner">
            <div>
              <p className="eyebrow">Your stay starts here</p>
              <h2>Ready to make<br /><em>a little room?</em></h2>
            </div>
            <div className="catalog-cta-actions">
              <Link className="button button-light" to="/booking">Book your stay <ArrowUpRight aria-hidden="true" /></Link>
              {configQuery.data?.phone && <a href={`tel:${configQuery.data.phone}`}>Questions? Call {configQuery.data.phone}</a>}
              {configQuery.data?.email && <a href={`mailto:${configQuery.data.email}`}>{configQuery.data.email}</a>}
            </div>
          </div>
        </section>
      </main>
    </>
  );
}