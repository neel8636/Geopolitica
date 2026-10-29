"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/*
  The phone header's menu: one button that opens the site links, the account and the theme
  switch in a panel under the header, so the header stays one short row on a phone. Closes on
  any tap inside it (a link was followed) or outside it, and on Escape.

  SHARED FILE: edited here, copied to apps/web by `npm run sync:shared`.
*/
export default function MobileNav({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (ev: PointerEvent) => {
      if (box.current && !box.current.contains(ev.target as Node)) setOpen(false);
    };
    const esc = (ev: KeyboardEvent) => ev.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={box} className="sm:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-line"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
          {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      {open ? (
        <div
          onClick={(ev) => {
            // a followed link closes the menu; the theme buttons keep it open
            if ((ev.target as Element).closest("a")) setOpen(false);
          }}
          className="absolute inset-x-0 top-full z-50 border-b border-line bg-paper px-4 pb-4 pt-2 shadow-[var(--shadow)]"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
