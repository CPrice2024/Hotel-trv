import { useEffect, type RefObject } from "react";

// Enhance only selected marketing content; data and forms remain visible without JS.
export function useScrollReveal(root: RefObject<HTMLDivElement | null>, enabled: boolean) {
  useEffect(() => {
    const container = root.current;
    if (!container || !enabled || !("IntersectionObserver" in window)) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const nodes = new Set<HTMLElement>();
    let intersection: IntersectionObserver | undefined;
    let mutations: MutationObserver | undefined;
    const selector = "[data-reveal], .stay-card, .room-list-card, .catalog-intro, .catalog-cta-inner";
    const clear = () => {
      intersection?.disconnect(); mutations?.disconnect();
      nodes.forEach(node => { node.classList.remove("reveal-pending", "reveal-in"); node.style.removeProperty("--reveal-delay"); });
      nodes.clear();
    };
    const start = () => {
      clear();
      if (motion.matches) return;
      intersection = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          const node = entry.target as HTMLElement;
          node.classList.remove("reveal-pending");
          node.classList.add("reveal-in");
          intersection?.unobserve(node);
        });
      }, { threshold: 0.08, rootMargin: "0px 0px -24px 0px" });
      const scan = (element: Element) => {
        const found = [...(element.matches(selector) ? [element] : []), ...element.querySelectorAll(selector)];
        found.forEach(candidate => {
          if (!(candidate instanceof HTMLElement) || nodes.has(candidate)) return;
          nodes.add(candidate);
          if (candidate.matches(".stay-card")) {
            const index = Array.from(candidate.parentElement?.children ?? []).indexOf(candidate);
            candidate.style.setProperty("--reveal-delay", `${(index % 3) * 80}ms`);
          }
          candidate.classList.add("reveal-pending");
          intersection?.observe(candidate);
        });
      };
      scan(container);
      // Room cards arrive asynchronously after the initial route render.
      mutations = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => { if (node instanceof Element) scan(node); })));
      mutations.observe(container, { childList: true, subtree: true });
    };
    start(); motion.addEventListener("change", start);
    return () => { clear(); motion.removeEventListener("change", start); };
  }, [root, enabled]);
}
