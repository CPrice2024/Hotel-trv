import { languages, translateChatMessage, translateText, useLanguage } from "../../i18n/language";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUp, MessageCircle, Send, Trash2, X } from "lucide-react";
import { api, type HotelConfig, type Room } from "../../api";
import { formatEtb, useUsdToEtbRate } from "../../hooks/useUsdToEtbRate";
import "./SupportChat.css";


type Topic = "help" | "rooms" | "prices" | "parking" | "amenities";
type ChatMessage = {
  id: string;
  sender: "guest" | "bot";
  text: string;
};
type SavedHistory = {
  messages: ChatMessage[];
  updatedAt: number;
};

const storageKey = "ayele-hotel-support-chat";
const historyLifetime = 12 * 60 * 60 * 1000;
const emptyHistory = (): SavedHistory => ({
  messages: [createWelcome()],
  updatedAt: Date.now(),
});
const topics: { id: Topic; en: string; am: string }[] = [
  { id: "help", en: "Need Help?", am: "እርዳታ?" },
  { id: "rooms", en: "Room Types", am: "የክፍል አይነቶች" },
  { id: "prices", en: "Prices", am: "ዋጋዎች" },
  { id: "parking", en: "Parking", am: "ፓርኪንግ" },
  { id: "amenities", en: "Amenities", am: "አገልግሎቶች" },
];

function createWelcome(): ChatMessage {
  return {
    id: "welcome",
    sender: "bot",
    text:
      "Welcome! How can we help you today?",
  };
}

function readSavedHistory(): SavedHistory {
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return emptyHistory();
    const parsed: unknown = JSON.parse(stored);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("updatedAt" in parsed) ||
      typeof parsed.updatedAt !== "number" ||
      !("messages" in parsed) ||
      !Array.isArray(parsed.messages)
    ) {
      return emptyHistory();
    }
    if (Date.now() - parsed.updatedAt >= historyLifetime) {
      localStorage.removeItem(storageKey);
      return emptyHistory();
    }
    const messages = parsed.messages.filter(
      (message): message is ChatMessage =>
        typeof message === "object" &&
        message !== null &&
        "id" in message &&
        typeof message.id === "string" &&
        "sender" in message &&
        (message.sender === "guest" || message.sender === "bot") &&
        "text" in message &&
        typeof message.text === "string",
    );
    return {
      messages: messages.length ? messages : [createWelcome()],
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return emptyHistory();
  }
}

function replyToTopic(
  topic: Topic,

  rooms: Room[],
  hotel: HotelConfig | undefined,
  usdToEtbRate: number | undefined,
): string {
  const contact =
    [
          "For more help, contact the hotel:",
          hotel?.phone ? `Phone: ${hotel.phone}` : "",
          hotel?.email ? `Email: ${hotel.email}` : "",
        ]
          .filter(Boolean)
          .join("\n");

  const getBirrRate = (room: Room) => {
    if (room.priceUSD > 0) {
      return usdToEtbRate
        ? formatEtb(room.priceUSD * usdToEtbRate)
        : "Birr estimate temporarily unavailable";
    }
    return room.priceETB > 0
      ? formatEtb(room.priceETB)
      : "Contact the hotel for the current rate";
  };

  switch (topic) {
    case "rooms":
      if (!rooms.length) {
        return `Please visit the booking page to see the rooms currently offered.\n${contact}`;
      }
      return `Room types currently listed:\n${rooms.map((room) => `• ${room.name}`).join("\n")}\nSee the booking page for your dates.`;
    case "prices":
      if (!rooms.length) {
        return `Current room prices are shown on the booking page.\n${contact}`;
      }
      return `Indicative Birr nightly prices:\n${rooms
            .map((room) => `• ${room.name}: ${getBirrRate(room)}`)
            .join("\n")}\nPrices are indicative conversions and may vary at checkout.`;
    case "parking":
      return `Complimentary secure guest parking is listed among the hotel services.${hotel?.address ? `\nAddress: ${hotel.address}` : ""}`;
    case "amenities":
      return "Hotel services listed include a restaurant, fitness center, spa, conference hall, airport shuttle (arrange 24 hours ahead), secure parking, and 24/7 room service. Please contact the hotel to confirm details.";
    case "help":
      return `I can help with room types, prices, parking, and hotel services. For other questions, contact the hotel directly.\n${contact}`;
  }
}

function detectTopic(message: string): Topic | null {
  const value = message.toLowerCase();
  if (/chambre|غرف|kutaa|kutaalee/.test(value)) return "rooms";
  if (/prix|tarif|أسعار|سعر|gatii/.test(value)) return "prices";
  if (/stationnement|موقف|konkolaataa/.test(value)) return "parking";
  if (/équipement|مرافق|خدمات|tajaajil|mijeeff/.test(value)) return "amenities";
  if (/aide|مساعدة|gargaarsa|qunnam/.test(value)) return "help";
  if (/room|rooms|type|bed|ክፍል|አልጋ/.test(value)) return "rooms";
  if (/price|cost|rate|how much|ዋጋ|ስንት/.test(value)) return "prices";
  if (/park|parking|car|ፓርኪንግ|መኪና/.test(value)) return "parking";
  if (/amenit|service|facility|restaurant|gym|spa|shuttle|አገልግሎት|ሬስቶራንት|ጂም/.test(value)) {
    return "amenities";
  }
  if (/help|contact|support|phone|email|እርዳታ|ስልክ|ኢሜይል/.test(value)) {
    return "help";
  }
  return null;
}

export function SupportChat() {
  const selectedLanguage = useLanguage();

  const [isOpen, setIsOpen] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  useEffect(() => {
    const updateScroll = () => setShowBackToTop(window.scrollY > 400);
    updateScroll();
    window.addEventListener("scroll", updateScroll, { passive: true });
    return () => window.removeEventListener("scroll", updateScroll);
  }, []);

  const [savedHistory] = useState(readSavedHistory);
  const [messages, setMessages] = useState<ChatMessage[]>(savedHistory.messages);
  const [historyUpdatedAt, setHistoryUpdatedAt] = useState(savedHistory.updatedAt);
  const [draft, setDraft] = useState("");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [hotel, setHotel] = useState<HotelConfig>();
  const exchangeRateQuery = useUsdToEtbRate();
  const messageListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void api
      .get<{ rooms: Room[] }>("/rooms")
      .then((response) => setRooms(response.data.rooms))
      .catch((error: unknown) => {
        console.error("Support chat could not load room information:", error);
      });
    void api
      .get<HotelConfig>("/public/config")
      .then((response) => setHotel(response.data))
      .catch((error: unknown) => {
        console.error("Support chat could not load hotel contact information:", error);
      });
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ updatedAt: historyUpdatedAt, messages }),
      );
    } catch {
      return;
    }
  }, [historyUpdatedAt, messages]);

  useEffect(() => {
    const remainingTime = Math.max(
      0,
      historyUpdatedAt + historyLifetime - Date.now(),
    );
    const timeout = window.setTimeout(() => {
      setMessages([createWelcome()]);
      setHistoryUpdatedAt(Date.now());
    }, remainingTime);
    return () => window.clearTimeout(timeout);
  }, [historyUpdatedAt]);



  useEffect(() => {
    if (isOpen) {
      messageListRef.current?.scrollTo({
        top: messageListRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [isOpen, messages]);

  function addGuestMessage(text: string, selectedTopic?: Topic) {
    const cleanText = text.trim();
    if (!cleanText) return;
    const topic = selectedTopic ?? detectTopic(cleanText);
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), sender: "guest", text: cleanText },
      {
        id: crypto.randomUUID(),
        sender: "bot",
        text: replyToTopic(topic ?? "help", rooms, hotel, exchangeRateQuery.data?.rate),
      },
    ]);
    setHistoryUpdatedAt(Date.now());
    setDraft("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    addGuestMessage(draft);
  }

  function clearHistory() {
    const welcome = createWelcome();
    setMessages([welcome]);
    setHistoryUpdatedAt(Date.now());
  }

  return (
    <aside className="support-chat" aria-label={translateText("Hotel support chat")}>
      {translateText(isOpen && (
        <section className="support-chat-panel" aria-label={translateText("Support conversation")}>
          <header className="support-chat-header">
            <span className="support-chat-status" aria-hidden="true" />
            <div className="support-chat-heading">
              <strong>{translateText("Hotel Support")}</strong>
              <span>{translateText("Automated help · instant replies")}</span>
            </div>
            <button
              className="support-chat-close"
              type="button"
              aria-label={translateText("Close support chat")}
              onClick={() => setIsOpen(false)}
            >
              <X aria-hidden="true" />
            </button>
          </header>

          <div className="support-chat-messages" ref={messageListRef} aria-live="polite">
            {translateText(messages.map((message) => (
              <p
                className={`support-chat-message is-${message.sender}${message.id === "welcome" ? " is-welcome" : ""}`}
                key={message.id}
              >
                {translateText(message.id === "welcome" && <MessageCircle aria-hidden="true" />)}
                {message.sender === "bot" ? translateChatMessage(message.text) : message.text}
              </p>
            )))}
          </div>

          <div className="support-chat-topics" aria-label={translateText("Frequently asked questions")}>
            {translateText(topics.map((topic) => (
              <button key={topic.id} type="button" onClick={() => addGuestMessage(translateText(topic.en), topic.id)}>
                {translateText(topic.en)}
              </button>
            )))}
          </div>

          <form className="support-chat-form" onSubmit={handleSubmit}>
            <label className="sr-only" htmlFor="support-chat-input">
              {translateText("Type your message")}
            </label>
            <input
              id="support-chat-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={translateText("Type your message...")}
              maxLength={500}
            />
            <button type="submit" aria-label={translateText("Send message")} disabled={!draft.trim()}>
              <Send aria-hidden="true" />
            </button>
          </form>

          <footer className="support-chat-footer">
            <span>{translateText("Chat history clears after 12 hours")}</span>
            <div className="support-chat-footer-actions">
              <span className="support-chat-language" lang={selectedLanguage}>{languages.find(({ code }) => code === selectedLanguage)?.label}</span>
              <button className="support-chat-clear" type="button" onClick={clearHistory}>
                <Trash2 aria-hidden="true" />
                {translateText("Clear now")}
              </button>
            </div>
          </footer>
        </section>
      ))}

      <div className="support-floating-actions">
      {translateText(showBackToTop && !isOpen && (
        <button
          className="back-to-top"
          type="button"
          aria-label={translateText("Back to top")}
          title={translateText("Back to top")}
          onClick={() => window.scrollTo({
            top: 0,
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
          })}
        >
          <ArrowUp aria-hidden="true" />
        </button>
      ))}
      <button
        className={`support-chat-launcher${isOpen ? " is-open" : ""}`}
        type="button"
        aria-label={translateText(isOpen ? ("Close support chat") : ("Open hotel support chat"))}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        {translateText(isOpen ? <X aria-hidden="true" /> : (
          <span className="chat-character" aria-hidden="true">
            <span className="chat-character-antenna" />
            <span className="chat-character-face">
              <span className="chat-character-eyes"><i /><i /></span>
              <span className="chat-character-smile" />
            </span>
            <span className="chat-character-hand" />
          </span>
        ))}
      </button>
      </div>
    </aside>
  );
}
