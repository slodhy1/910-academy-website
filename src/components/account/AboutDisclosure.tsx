"use client";

import { useState } from "react";

export function AboutDisclosure({ description }: { description: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="about-wrap">
      <button
        type="button"
        className="about-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>About this product</span>
        <span className={`about-caret ${open ? "open" : ""}`} aria-hidden="true">
          ▾
        </span>
      </button>
      {open && <div className="about-body">{description}</div>}
      <style>{`
        .about-wrap { border-top: 1px solid var(--border); padding-top: 24px; }
        .about-toggle { display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 16px 20px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: rgba(255,255,255,0.02); color: var(--fg); font-family: var(--font); font-size: 13px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; cursor: pointer; transition: all 0.2s; }
        .about-toggle:hover { border-color: var(--accent-border-subtle); background: var(--accent-subtle); }
        .about-caret { font-size: 14px; transition: transform 0.2s; color: var(--fg-muted); }
        .about-caret.open { transform: rotate(180deg); }
        .about-body { padding: 20px 4px 0; color: var(--fg-muted); font-size: 0.95rem; line-height: 1.7; }
      `}</style>
    </section>
  );
}
