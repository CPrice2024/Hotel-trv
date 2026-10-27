import { translateText, useLanguage } from "../../i18n/language";
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
  useLanguage();
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
          <p className="eyebrow">{translateText("A room for every kind of stay")}</p>
          <h1>{translateText("Find your place")}<br /><em>{translateText("to unwind.")}</em></h1>
          <p>{translateText("Thoughtful comforts, welcoming spaces, and a restful stay in Dilla.")}</p>
          <a className="button button-light" href="#room-list">{translateText("Explore rooms ")}<ArrowUpRight aria-hidden="true" />
          </a>
        </section>

        <section className="catalog-section section-wrap" id="room-list">
          <div className="catalog-intro">
            <div>
              <p className="eyebrow">{translateText("Our rooms")}</p>
              <h2>{translateText("Stay a little ")}<em>{translateText("more comfortably.")}</em></h2>
            </div>
            <p>{translateText("Choose a room to see its current rate and start planning your visit.")}</p>
          </div>

          {translateText(roomsQuery.isLoading && <p className="catalog-message" role="status">{translateText("Loading available rooms…")}</p>)}
          {translateText(roomsQuery.isError && (
            <p className="catalog-message catalog-error" role="alert">{translateText("We could not load room details right now. Please try again later or contact the hotel.")}</p>
          ))}
          {translateText(!roomsQuery.isLoading && !roomsQuery.isError && rooms.length === 0 && (
            <p className="catalog-message">{translateText("There are no rooms available to display right now. Please contact the hotel for assistance.")}</p>
          ))}

          {translateText(rooms.length > 0 && (
            <div className="room-list">
              {translateText(rooms.map((room, index) => (
                <article className="room-list-card" key={room.id}>
                  <div className="room-list-photo">
                  {translateText(room.imageUrl ? (
                    <img
                      className="room-list-image"
                      src={getRoomImageUrl(room.imageUrl)}
                      alt={translateText(`${room.name} at Ayele Degu International Hotel`)}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="room-list-image room-image-placeholder" aria-hidden="true">
                      <BedDouble />
                    </div>
                  ))}
                    <span className="stay-image-shade" aria-hidden="true" />
                  </div>
                  <div className="room-list-content">
                    <span className="card-number">{translateText(String(index + 1).padStart(2, "0"))}{translateText(" / ROOM")}</span>
                    <h3>{translateText(room.name)}</h3>
                    <p className="room-list-description">
                      {translateText(convertUsdPricesToEtb(room.description, exchangeRateQuery.data?.rate))}
                    </p>
                    <div className="room-list-facts">
                      <span><Users aria-hidden="true" />{translateText(" Up to ")}{translateText(room.maxGuests)}{translateText(" guests")}</span>
                      <span><BedDouble aria-hidden="true" />{translateText(" Room type")}</span>
                    </div>
                    <div className="room-list-bottom">
                      <div className="room-list-rates" aria-label={translateText("Listed nightly rates")}>
                        {translateText(room.priceUSD > 0 && exchangeRateQuery.data && (
                          <>
                            <span>{translateText(formatEtb(room.priceUSD * exchangeRateQuery.data.rate))}</span>
                            <small>{translateText("/ night · indicative conversion")}</small>
                          </>
                        ))}
                        {translateText(room.priceUSD > 0 && exchangeRateQuery.isLoading && (
                          <span>{translateText("Loading Birr price…")}</span>
                        ))}
                        {translateText(room.priceUSD > 0 && exchangeRateQuery.isError && (
                          <span className="price-rate-error">{translateText("Birr estimate unavailable")}</span>
                        ))}
                        {translateText(room.priceUSD <= 0 && room.priceETB > 0 && (
                          <>
                            <span>{translateText(formatEtb(room.priceETB))}</span>
                            <small>{translateText("/ night")}</small>
                          </>
                        ))}
                        {translateText(room.priceETB <= 0 && room.priceUSD <= 0 && <span>{translateText("Contact us for current rates")}</span>)}
                      </div>
                      {translateText(room.testOnly && <span className="test-data-badge">{translateText("Local test inventory")}</span>)}
                      <Link
                        className="button button-dark room-book-link"
                        to={`/booking?roomId=${encodeURIComponent(room.id)}`}
                        state={location.state}
                      >{translateText("Select room ")}<ArrowUpRight aria-hidden="true" />
                      </Link>
                    </div>
                  </div>
                </article>
              )))}
            </div>
          ))}
          {translateText(exchangeRateQuery.data && (
            <p className="price-rate-disclaimer">{translateText("Birr prices are indicative conversions from the public USD/ETB rate, updated ")}{translateText(formatRateTimestamp(exchangeRateQuery.data.updatedAt))}{translateText(" UTC. Your final charge uses the payment currency and room rate confirmed at checkout.")}</p>
          ))}
        </section>

        <section className="catalog-cta">
          <div className="section-wrap catalog-cta-inner">
            <div>
              <p className="eyebrow">{translateText("Your stay starts here")}</p>
              <h2>{translateText("Ready to make")}<br /><em>{translateText("a little room?")}</em></h2>
            </div>
            <div className="catalog-cta-actions">
              <Link className="button button-light" to="/booking">{translateText("Book your stay ")}<ArrowUpRight aria-hidden="true" /></Link>
              {translateText(configQuery.data?.phone && <a href={`tel:${configQuery.data.phone}`}>{translateText("Questions? Call ")}{translateText(configQuery.data.phone)}</a>)}
              {translateText(configQuery.data?.email && <a href={`mailto:${configQuery.data.email}`}>{translateText(configQuery.data.email)}</a>)}
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
