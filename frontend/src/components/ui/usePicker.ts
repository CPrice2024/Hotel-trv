import { useEffect, useLayoutEffect, useRef, useState } from "react";

export function usePicker(onBlur?: () => void) {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<"top" | "bottom">("bottom");
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const button = trigger.current?.getBoundingClientRect();
      const popup = root.current?.querySelector(".picker-popover")?.getBoundingClientRect();
      if (!button || !popup) return;
      const below = window.innerHeight - button.bottom;
      setSide(below < popup.height + 16 && button.top > below ? "top" : "bottom");
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);
  const close = (restoreFocus = false) => {
    setOpen(false);
    onBlur?.();
    if (restoreFocus) trigger.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) { setOpen(false); onBlur?.(); }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); onBlur?.(); trigger.current?.focus(); }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open, onBlur]);
  return { open, setOpen, root, trigger, close, side };
}
