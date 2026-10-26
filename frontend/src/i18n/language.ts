import { useSyncExternalStore } from "react";
import translations from "./translations.json";

export type Language = "en" | "fr" | "ar" | "am" | "om";
export const languages: { code: Language; label: string; group: "international" | "local" }[] = [
  { code: "en", label: "English", group: "international" },
  { code: "fr", label: "Français", group: "international" },
  { code: "ar", label: "العربية", group: "international" },
  { code: "am", label: "አማርኛ", group: "local" },
  { code: "om", label: "Afaan Oromoo", group: "local" },
];
const storageKey = "ayele-hotel-language";
function readLanguage(): Language {
  try {
    const saved = localStorage.getItem(storageKey);
    return languages.find(({ code }) => code === saved)?.code ?? "en";
  } catch { return "en"; }
}
let language = readLanguage();
const listeners = new Set<() => void>();
function applyDocumentLanguage() {
  document.documentElement.lang = language;
  document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
}
applyDocumentLanguage();
export function setLanguage(next: Language) {
  language = next;
  try { localStorage.setItem(storageKey, next); } catch { /* Still works without storage. */ }
  applyDocumentLanguage();
  listeners.forEach((listener) => listener());
}
export function useLanguage() {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, () => language, () => "en" as Language);
}
export function getLocale() {
  return { en: "en", fr: "fr", ar: "ar", am: "am-ET", om: "om-ET" }[language];
}
window.addEventListener("storage", (event) => {
  if (event.key === storageKey) setLanguage(readLanguage());
});
const normalizeKey = (value: string) => value.normalize("NFC").replace(/[\u2010\u2011]/g, "-").replace(/\s+/g, " ").trim();
const catalog = Object.fromEntries(Object.entries(translations).map(([key, value]) => [normalizeKey(key), value])) as Record<string, Partial<Record<Language, string>>>;
const templates = Object.entries(catalog).filter(([key]) => /\{\w+\}/.test(key)).map(([key, values]) => {
  const names: string[] = [];
  const escaped = key.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
  const pattern = escaped.replace(/\{(\w+)\}/g, (_match, name: string) => { names.push(name); return "(.+?)"; });
  return { pattern: new RegExp(`^${pattern}$`), names, values };
});

// Only exact interface phrases are translated. Guest names, references, emails,
// payment values and unknown hotel-provided content retain their original value.
export function translateText<T>(value: T): T {
  if (typeof value !== "string" || language === "en") return value;
  const key = normalizeKey(value);
  let translated = catalog[key]?.[language];
  if (!translated) {
    for (const template of templates) {
      const match = template.pattern.exec(key);
      if (!match || !template.values[language]) continue;
      translated = template.values[language]!.replace(/\{(\w+)\}/g, (_token, name: string) => match[template.names.indexOf(name) + 1]);
      break;
    }
  }
  if (!translated) return value;
  const leading = value.match(/^\s*/)?.[0] ?? "";
  const trailing = value.match(/\s*$/)?.[0] ?? "";
  return (leading + translated + trailing) as T;
}

export function formatStayDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat(getLocale(), { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

export function translateChatMessage(value: string): string {
  return value.split("\n").map((line) => {
    if (line.startsWith("• ")) {
      const [name, ...price] = line.slice(2).split(": ");
      return `• ${translateText(name)}${price.length ? `: ${translateText(price.join(": "))}` : ""}`;
    }
    return translateText(line);
  }).join("\n");
}
