import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUp, MessageCircle, Send, Trash2, X } from "lucide-react";
import { api, type HotelConfig, type Room } from "../../api";
import { formatEtb, useUsdToEtbRate } from "../../hooks/useUsdToEtbRate";
import "./SupportChat.css";

type Language = "en" | "am";
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
  messages: [createWelcome("en")],
  updatedAt: Date.now(),
});
const topics: { id: Topic; en: string; am: string }[] = [
  { id: "help", en: "Need Help?", am: "እርዳታ?" },
  { id: "rooms", en: "Room Types", am: "የክፍል አይነቶች" },
  { id: "prices", en: "Prices", am: "ዋጋዎች" },
  { id: "parking", en: "Parking", am: "ፓርኪንግ" },
  { id: "amenities", en: "Amenities", am: "አገልግሎቶች" },
];

function createWelcome(language: Language): ChatMessage {
  return {
    id: "welcome",
    sender: "bot",
    text:
      language === "en"
        ? "Welcome! How can we help you today?"
        : "እንኳን ደህና መጡ! ዛሬ እንዴት ልንረዳዎት እንችላለን?",
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
      messages: messages.length ? messages : [createWelcome("en")],
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return emptyHistory();
  }
}

function replyToTopic(
  topic: Topic,
  language: Language,
  rooms: Room[],
  hotel: HotelConfig | undefined,
  usdToEtbRate: number | undefined,
): string {
  const contact =
    language === "en"
      ? [
          "For more help, contact the hotel:",
          hotel?.phone ? `Phone: ${hotel.phone}` : "",
          hotel?.email ? `Email: ${hotel.email}` : "",
        ]
          .filter(Boolean)
          .join("\n")
      : [
          "ተጨማሪ እርዳታ ከፈለጉ ሆቴሉን ያግኙ:",
          hotel?.phone ? `ስልክ: ${hotel.phone}` : "",
          hotel?.email ? `ኢሜይል: ${hotel.email}` : "",
        ]
          .filter(Boolean)
          .join("\n");

  const getBirrRate = (room: Room) => {
    if (room.priceUSD > 0) {
      return usdToEtbRate
        ? formatEtb(room.priceUSD * usdToEtbRate)
        : language === "en"
          ? "Birr estimate temporarily unavailable"
          : "የብር ግምት ለጊዜው አይገኝም";
    }
    return room.priceETB > 0
      ? formatEtb(room.priceETB)
      : language === "en"
        ? "Contact the hotel for the current rate"
        : "ለአሁኑ ዋጋ ሆቴሉን ያግኙ";
  };

  switch (topic) {
    case "rooms":
      if (!rooms.length) {
        return language === "en"
          ? `Please visit the booking page to see the rooms currently offered.\n${contact}`
          : `አሁን ያሉትን ክፍሎች ለማየት የቦታ ማስያዣ ገጹን ይጎብኙ።\n${contact}`;
      }
      return language === "en"
        ? `Room types currently listed:\n${rooms.map((room) => `• ${room.name}`).join("\n")}\nSee the booking page for your dates.`
        : `አሁን የተዘረዘሩ የክፍል አይነቶች:\n${rooms.map((room) => `• ${room.name}`).join("\n")}\nለቀኖችዎ የቦታ ማስያዣ ገጹን ይመልከቱ።`;
    case "prices":
      if (!rooms.length) {
        return language === "en"
          ? `Current room prices are shown on the booking page.\n${contact}`
          : `የአሁኑን የክፍል ዋጋዎች በቦታ ማስያዣ ገጹ ላይ ይመልከቱ።\n${contact}`;
      }
      return language === "en"
        ? `Indicative Birr nightly prices:\n${rooms
            .map((room) => `• ${room.name}: ${getBirrRate(room)}`)
            .join("\n")}\nPrices are indicative conversions and may vary at checkout.`
        : `ግምታዊ የአንድ ሌሊት ዋጋዎች በብር:\n${rooms
            .map((room) => `• ${room.name}: ${getBirrRate(room)}`)
            .join("\n")}\nዋጋዎቹ ግምታዊ ልወጣዎች ናቸው፤ በክፍያ ጊዜ ሊለያዩ ይችላሉ።`;
    case "parking":
      return language === "en"
        ? `Complimentary secure guest parking is listed among the hotel services.${hotel?.address ? `\nAddress: ${hotel.address}` : ""}`
        : `ለእንግዶች ነፃ የተጠበቀ ፓርኪንግ እንዳለ ተዘርዝሯል።${hotel?.address ? `\nአድራሻ: ${hotel.address}` : ""}`;
    case "amenities":
      return language === "en"
        ? "Hotel services listed include a restaurant, fitness center, spa, conference hall, airport shuttle (arrange 24 hours ahead), secure parking, and 24/7 room service. Please contact the hotel to confirm details."
        : "የሆቴሉ አገልግሎቶች ሬስቶራንት፣ ጂም፣ ስፓ፣ የስብሰባ አዳራሽ፣ አስቀድሞ የሚዘጋጅ የአየር ማረፊያ መጓጓዣ፣ የተጠበቀ ፓርኪንግ እና የ24 ሰዓት የክፍል አገልግሎት ያካትታሉ። ዝርዝሩን ለማረጋገጥ ሆቴሉን ያግኙ።";
    case "help":
      return language === "en"
        ? `I can help with room types, prices, parking, and hotel services. For other questions, contact the hotel directly.\n${contact}`
        : `ስለ ክፍሎች፣ ዋጋዎች፣ ፓርኪንግ እና የሆቴል አገልግሎቶች ልረዳዎት እችላለሁ። ለሌሎች ጥያቄዎች ሆቴሉን በቀጥታ ያግኙ።\n${contact}`;
  }
}

function detectTopic(message: string): Topic | null {
  const value = message.toLowerCase();
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

function getSavedLanguage(): Language {
  try {
    return localStorage.getItem(`${storageKey}-language`) === "am" ? "am" : "en";
  } catch {
    return "en";
  }
}

export function SupportChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  useEffect(() => {
    const updateScroll = () => setShowBackToTop(window.scrollY > 400);
    updateScroll();
    window.addEventListener("scroll", updateScroll, { passive: true });
    return () => window.removeEventListener("scroll", updateScroll);
  }, []);
  const [language, setLanguage] = useState<Language>(getSavedLanguage);
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
      setMessages([createWelcome(language)]);
      setHistoryUpdatedAt(Date.now());
    }, remainingTime);
    return () => window.clearTimeout(timeout);
  }, [historyUpdatedAt, language]);

  useEffect(() => {
    try {
      localStorage.setItem(`${storageKey}-language`, language);
    } catch {
      return;
    }
  }, [language]);

  useEffect(() => {
    if (isOpen) {
      messageListRef.current?.scrollTo({
        top: messageListRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [isOpen, messages]);

  function addGuestMessage(text: string) {
    const cleanText = text.trim();
    if (!cleanText) return;
    const topic = detectTopic(cleanText);
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), sender: "guest", text: cleanText },
      {
        id: crypto.randomUUID(),
        sender: "bot",
        text: replyToTopic(topic ?? "help", language, rooms, hotel, exchangeRateQuery.data?.rate),
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
    const welcome = createWelcome(language);
    setMessages([welcome]);
    setHistoryUpdatedAt(Date.now());
  }

  return (
    <aside className="support-chat" aria-label={language === "en" ? "Hotel support chat" : "የሆቴል ድጋፍ ውይይት"}>
      {isOpen && (
        <section className="support-chat-panel" aria-label={language === "en" ? "Support conversation" : "የድጋፍ ውይይት"}>
          <header className="support-chat-header">
            <span className="support-chat-status" aria-hidden="true" />
            <div className="support-chat-heading">
              <strong>{language === "en" ? "Hotel Support" : "የሆቴል ድጋፍ"}</strong>
              <span>{language === "en" ? "Automated help · instant replies" : "ራስ-ሰር እርዳታ · ፈጣን ምላሽ"}</span>
            </div>
            <button
              className="support-chat-close"
              type="button"
              aria-label={language === "en" ? "Close support chat" : "ውይይቱን ዝጋ"}
              onClick={() => setIsOpen(false)}
            >
              <X aria-hidden="true" />
            </button>
          </header>

          <div className="support-chat-messages" ref={messageListRef} aria-live="polite">
            {messages.map((message) => (
              <p
                className={`support-chat-message is-${message.sender}${message.id === "welcome" ? " is-welcome" : ""}`}
                key={message.id}
              >
                {message.id === "welcome" && <MessageCircle aria-hidden="true" />}
                {message.text}
              </p>
            ))}
          </div>

          <div className="support-chat-topics" aria-label={language === "en" ? "Frequently asked questions" : "ተደጋጋሚ ጥያቄዎች"}>
            {topics.map((topic) => (
              <button key={topic.id} type="button" onClick={() => addGuestMessage(topic.en)}>
                {language === "en" ? topic.en : topic.am}
              </button>
            ))}
          </div>

          <form className="support-chat-form" onSubmit={handleSubmit}>
            <label className="sr-only" htmlFor="support-chat-input">
              {language === "en" ? "Type your message" : "መልዕክትዎን ይጻፉ"}
            </label>
            <input
              id="support-chat-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={language === "en" ? "Type your message..." : "መልዕክትዎን ይጻፉ..."}
              maxLength={500}
            />
            <button type="submit" aria-label={language === "en" ? "Send message" : "መልዕክት ላክ"} disabled={!draft.trim()}>
              <Send aria-hidden="true" />
            </button>
          </form>

          <footer className="support-chat-footer">
            <span>{language === "en" ? "Chat history clears after 12 hours" : "የውይይት ታሪክ ከ12 ሰዓት በኋላ ይጠፋል"}</span>
            <div className="support-chat-footer-actions">
              <button
                className="support-chat-language"
                type="button"
                onClick={() => setLanguage((current) => (current === "en" ? "am" : "en"))}
                aria-label={language === "en" ? "Switch to Amharic" : "Switch to English"}
              >
                {language === "en" ? "ET / GB" : "አማ / EN"}
              </button>
              <button className="support-chat-clear" type="button" onClick={clearHistory}>
                <Trash2 aria-hidden="true" />
                {language === "en" ? "Clear now" : "አሁን አጽዳ"}
              </button>
            </div>
          </footer>
        </section>
      )}

      <div className="support-floating-actions">
      {showBackToTop && !isOpen && (
        <button
          className="back-to-top"
          type="button"
          aria-label="Back to top"
          title="Back to top"
          onClick={() => window.scrollTo({
            top: 0,
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
          })}
        >
          <ArrowUp aria-hidden="true" />
        </button>
      )}
      <button
        className={`support-chat-launcher${isOpen ? " is-open" : ""}`}
        type="button"
        aria-label={isOpen ? (language === "en" ? "Close support chat" : "ውይይቱን ዝጋ") : (language === "en" ? "Open hotel support chat" : "የሆቴል ድጋፍ ይክፈቱ")}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        {isOpen ? <X aria-hidden="true" /> : (
          <span className="chat-character" aria-hidden="true">
            <span className="chat-character-antenna" />
            <span className="chat-character-face">
              <span className="chat-character-eyes"><i /><i /></span>
              <span className="chat-character-smile" />
            </span>
            <span className="chat-character-hand" />
          </span>
        )}
      </button>
      </div>
    </aside>
  );
}
