import { Check, Globe2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { languages, setLanguage, translateText as t, useLanguage } from "../i18n/language";
import "./LanguageSelector.css";

export function LanguageSelector() {
  const selected = useLanguage();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div className="language-selector" ref={container}>
      <button className="language-trigger" type="button" ref={trigger}
        aria-label={`${t("Choose language")}: ${languages.find(({ code }) => code === selected)?.label}`}
        title={t("Choose language")} aria-expanded={open} aria-controls="language-options"
        onClick={() => setOpen((value) => !value)}>
        <Globe2 aria-hidden="true" />
        <span className="language-code" aria-hidden="true">{selected.toUpperCase()}</span>
      </button>
      {open && (
        <div className="language-dropdown" id="language-options" role="group" aria-label={t("Choose language")}>
          <p className="language-dropdown-title">{t("Choose language")}</p>
          {(["international", "local"] as const).map((group) => (
            <div className="language-group" key={group}>
              <p>{t(group === "international" ? "International" : "Local")}</p>
              {languages.filter((item) => item.group === group).map((item) => (
                <button type="button" key={item.code} lang={item.code} dir="auto"
                  aria-pressed={selected === item.code}
                  onClick={() => { setLanguage(item.code); setOpen(false); trigger.current?.focus(); }}>
                  <span>{item.label}</span>
                  {selected === item.code && <Check aria-hidden="true" />}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
