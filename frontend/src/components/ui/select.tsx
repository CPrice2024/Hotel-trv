import { BedDouble, Check, ChevronDown, Users } from "lucide-react";
import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { translateText as t, useLanguage } from "../../i18n/language";
import { usePicker } from "./usePicker";
import "./pickers.css";

interface RoomOption { value: string; label: string; price: string; guests: number; imageUrl?: string; }
interface RoomSelectProps {
  id: string;
  value: string;
  options: RoomOption[];
  invalid?: boolean;
  onChange: (value: string) => void;
  onBlur?: () => void;
}
export function RoomSelect({ id, value, options, invalid, onChange, onBlur }: RoomSelectProps) {
  useLanguage();
  const picker = usePicker(onBlur);
  const listId = useId();
  const [activeIndex, setActiveIndex] = useState(0);
  const selected = options.find((option) => option.value === value);
  useEffect(() => {
    if (!picker.open) return;
    const frame = requestAnimationFrame(() => {
      const option = picker.root.current?.querySelector<HTMLButtonElement>(`[data-option="${activeIndex}"]`);
      option?.focus();
      option?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeIndex, picker.open, picker.root]);
  const open = () => { setActiveIndex(Math.max(0, options.findIndex((option) => option.value === value))); picker.setOpen(true); };
  const keyboard = (event: KeyboardEvent) => {
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      if (!picker.open) { open(); return; }
      setActiveIndex((index) => event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
    } else if (event.key.length === 1 && /\S/.test(event.key)) {
      const index = options.findIndex((option) => t(option.label).toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase()));
      if (index >= 0) { event.preventDefault(); picker.setOpen(true); setActiveIndex(index); }
    }
  };
  return (
    <div className="hotel-picker room-picker" ref={picker.root} onKeyDown={keyboard} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) picker.close();
    }}>
      <button id={id} type="button" role="combobox" className={`picker-trigger${selected ? " has-value" : ""}`}
        ref={picker.trigger} aria-label={t("Room type")} aria-haspopup="listbox" aria-expanded={picker.open} aria-controls={listId}
        aria-invalid={invalid || undefined} disabled={!options.length} onClick={() => picker.open ? picker.close() : open()}>
        <BedDouble aria-hidden="true" />
        <span>{selected ? t(selected.label) : t("Select a room")}</span>
        <ChevronDown className={picker.open ? "picker-chevron is-open" : "picker-chevron"} aria-hidden="true" />
      </button>
      {picker.open && <div className="picker-popover room-options" data-side={picker.side} id={listId} role="listbox" aria-label={t("Choose your room")}>
        <p className="room-options-heading">{t("Choose your room")}</p>
        {options.map((option, index) => (
          <button type="button" role="option" key={option.value} data-option={index}
            tabIndex={index === activeIndex ? 0 : -1} aria-selected={option.value === value}
            className="room-option" onFocus={() => setActiveIndex(index)}
            onClick={() => { onChange(option.value); picker.close(true); }}>
            {option.imageUrl ? <img src={option.imageUrl} alt="" loading="lazy" /> : <span className="room-option-image"><BedDouble aria-hidden="true" /></span>}
            <span className="room-option-copy"><strong>{t(option.label)}</strong>
              <span><Users aria-hidden="true" />{t("Up to")} {option.guests} {t(option.guests === 1 ? "guest" : "guests")}</span>
              <span className="room-option-price">{t(option.price)} <small>{t("/ night")}</small></span>
            </span>
            {option.value === value && <Check className="room-option-check" aria-hidden="true" />}
          </button>
        ))}
      </div>}
    </div>
  );
}
