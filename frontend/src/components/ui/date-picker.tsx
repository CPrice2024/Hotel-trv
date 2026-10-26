import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { formatStayDate, getLocale, translateText as t, useLanguage } from "../../i18n/language";
import { usePicker } from "./usePicker";
import "./pickers.css";

const fromISO = (value: string) => new Date(`${value}T12:00:00Z`);
const toISO = (date: Date) => date.toISOString().slice(0, 10);
export function addDateDays(value: string, days: number) {
  const date = fromISO(value);
  date.setUTCDate(date.getUTCDate() + days);
  return toISO(date);
}
function monthStart(value: string) { return `${value.slice(0, 7)}-01`; }
function changeMonth(value: string, offset: number) {
  const date = fromISO(monthStart(value));
  date.setUTCMonth(date.getUTCMonth() + offset);
  return toISO(date);
}

interface DatePickerProps {
  id: string;
  label: string;
  value: string;
  min: string;
  max?: string;
  invalid?: boolean;
  onChange: (value: string) => void;
  onBlur?: () => void;
}

export function DatePicker({ id, label, value, min, max, invalid, onChange, onBlur }: DatePickerProps) {
  useLanguage();
  const picker = usePicker(onBlur);
  const popupId = useId();
  const [month, setMonth] = useState(() => monthStart(value || min));
  const [focusedDate, setFocusedDate] = useState(value || min);
  const enabled = (date: string) => date >= min && (!max || date <= max);
  const monthDate = fromISO(month);
  const daysInMonth = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 0)).getUTCDate();
  const offset = (monthDate.getUTCDay() + 6) % 7;
  const locale = getLocale();
  const caption = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(monthDate);
  const today = new Date();
  const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const focusDay = (date: string) => {
    const bounded = date < min ? min : max && date > max ? max : date;
    setFocusedDate(bounded);
    setMonth(monthStart(bounded));
  };
  useEffect(() => {
    if (!picker.open) return;
    const frame = requestAnimationFrame(() => picker.root.current?.querySelector<HTMLButtonElement>(`[data-date="${focusedDate}"]`)?.focus());
    return () => cancelAnimationFrame(frame);
  }, [focusedDate, picker.open, picker.root]);
  const navigateMonth = (offset: number) => {
    const target = changeMonth(month, offset);
    focusDay(target < min ? min : target);
  };
  const keyDown = (event: KeyboardEvent<HTMLButtonElement>, date: string) => {
    const rtl = document.documentElement.dir === "rtl";
    const offsets: Record<string, number> = { ArrowLeft: rtl ? 1 : -1, ArrowRight: rtl ? -1 : 1, ArrowUp: -7, ArrowDown: 7 };
    if (event.key in offsets) { event.preventDefault(); focusDay(addDateDays(date, offsets[event.key])); }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const weekday = (fromISO(date).getUTCDay() + 6) % 7;
      focusDay(addDateDays(date, event.key === "Home" ? -weekday : 6 - weekday));
    }
    if (event.key === "PageUp" || event.key === "PageDown") { event.preventDefault(); navigateMonth(event.key === "PageUp" ? -1 : 1); }
  };
  const choose = (date: string) => { onChange(date); picker.close(true); };
  return (
    <div className="hotel-picker" ref={picker.root} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) picker.close();
    }}>
      <button id={id} type="button" className={`picker-trigger${value ? " has-value" : ""}`}
        ref={picker.trigger} aria-haspopup="dialog" aria-expanded={picker.open} aria-controls={popupId}
        aria-label={`${label}: ${value ? formatStayDate(value) : t("Choose a date")}`}
        aria-invalid={invalid || undefined}
        onClick={() => {
          if (!picker.open) { const date = enabled(value) ? value : min; setFocusedDate(date); setMonth(monthStart(date)); }
          picker.setOpen(!picker.open);
        }}>
        <CalendarDays aria-hidden="true" />
        <span>{value ? formatStayDate(value) : t("Choose a date")}</span>
      </button>
      {picker.open && (
        <div className="picker-popover date-popover" data-side={picker.side} id={popupId} role="dialog" aria-label={label}>
          <div className="calendar-heading">
            <button type="button" className="calendar-nav" aria-label={t("Previous month")} disabled={month <= monthStart(min)} onClick={() => navigateMonth(-1)}>
              <ChevronLeft aria-hidden="true" />
            </button>
            <strong aria-live="polite">{caption}</strong>
            <button type="button" className="calendar-nav" aria-label={t("Next month")} disabled={!!max && month >= monthStart(max)} onClick={() => navigateMonth(1)}>
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
          <div className="calendar-weekdays" aria-hidden="true">
            {Array.from({ length: 7 }, (_, index) => <span key={index}>{new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 0, 5 + index)))}</span>)}
          </div>
          <div className="calendar-days" role="group" aria-label={caption}>
            {Array.from({ length: offset }, (_, index) => <span key={`blank-${index}`} />)}
            {Array.from({ length: daysInMonth }, (_, index) => {
              const date = `${month.slice(0, 7)}-${String(index + 1).padStart(2, "0")}`;
              return <button key={date} type="button" data-date={date} tabIndex={date === focusedDate ? 0 : -1}
                className={`calendar-day${date === value ? " is-selected" : ""}${date === todayISO ? " is-today" : ""}`}
                disabled={!enabled(date)} aria-label={formatStayDate(date)} aria-pressed={date === value}
                aria-current={date === todayISO ? "date" : undefined}
                onFocus={() => setFocusedDate(date)} onKeyDown={(event) => keyDown(event, date)} onClick={() => choose(date)}>
                {new Intl.NumberFormat(locale).format(index + 1)}
              </button>;
            })}
          </div>
          <div className="calendar-footer">
            <span>{t("Select your stay date")}</span>
            <button type="button" disabled={!enabled(todayISO)} onClick={() => choose(todayISO)}>{t("Today")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
