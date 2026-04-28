"use client";

import { useState } from "react";

export type ResourceRow = {
  id: string;
  resource_type: "link" | "download" | "code";
  title: string;
  description: string | null;
  url: string | null;
  storage_path: string | null;
  code_value: string | null;
  display_order: number;
};

type Props = {
  resources: ResourceRow[];
  signedUrls?: Record<string, string>;
};

export function ResourcesPanel({ resources, signedUrls = {} }: Props) {
  if (!resources.length) return null;

  return (
    <section className="rp">
      <header className="rp-head">
        <p className="rp-eyebrow">Resources & Links</p>
        <h2 className="rp-title">Software, plugins, and downloads used in this workshop.</h2>
      </header>
      <div className="rp-grid">
        {resources.map((r) => (
          <ResourceCard key={r.id} resource={r} signedUrl={r.storage_path ? signedUrls[r.storage_path] : undefined} />
        ))}
      </div>
      <style>{`
        .rp { display: flex; flex-direction: column; gap: 24px; max-width: 1100px; margin: 0 auto; width: 100%; }
        .rp-head { display: flex; flex-direction: column; gap: 8px; }
        .rp-eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 0.3em; text-transform: uppercase; color: var(--accent); }
        .rp-title { font-size: clamp(1.1rem, 2.2vw, 1.4rem); font-weight: 500; color: var(--fg); line-height: 1.3; }
        .rp-grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
        @media (min-width: 720px) { .rp-grid { grid-template-columns: 1fr 1fr; gap: 20px; } }
      `}</style>
    </section>
  );
}

function ResourceCard({ resource, signedUrl }: { resource: ResourceRow; signedUrl?: string }) {
  const { resource_type, title, description, url, code_value } = resource;

  return (
    <div className="rc">
      <div className="rc-body">
        <h3 className="rc-title">{title}</h3>
        {description && <p className="rc-desc">{description}</p>}
        {resource_type === "code" && code_value && <CodeBlock code={code_value} />}
      </div>
      <div className="rc-footer">
        {resource_type === "link" && url && (
          <a href={url} target="_blank" rel="noopener noreferrer" className="rc-btn">
            Open ↗
          </a>
        )}
        {resource_type === "link" && !url && (
          <span className="rc-btn rc-btn-disabled">No link</span>
        )}
        {resource_type === "download" && signedUrl && (
          <a href={signedUrl} download className="rc-btn">
            Download ↓
          </a>
        )}
        {resource_type === "download" && !signedUrl && (
          <span className="rc-btn rc-btn-disabled">Coming soon</span>
        )}
      </div>
      <style>{`
        .rc { display: flex; flex-direction: column; justify-content: space-between; gap: 16px; padding: 24px; border: 1px solid var(--border); border-radius: var(--radius-md); background: rgba(255,255,255,0.02); transition: all 0.25s var(--ease-smooth); }
        .rc:hover { border-color: var(--accent-border-subtle); background: var(--accent-subtle); transform: translateY(-2px); }
        .rc-body { display: flex; flex-direction: column; gap: 8px; }
        .rc-title { font-size: 1rem; font-weight: 700; color: var(--fg); }
        .rc-desc { font-size: 0.9rem; color: var(--fg-muted); line-height: 1.55; }
        .rc-footer { display: flex; align-items: center; gap: 12px; }
        .rc-btn { padding: 10px 18px; border-radius: var(--radius-sm); border: 1px solid var(--accent); background: var(--accent-subtle); color: var(--accent); font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; transition: all 0.2s; }
        a.rc-btn:hover { background: var(--accent); color: #000; }
        .rc-btn-disabled { border-color: var(--border); color: var(--fg-dim); background: transparent; cursor: not-allowed; }
      `}</style>
    </div>
  );
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }
  return (
    <button type="button" className="cb" onClick={copy} aria-label={`Copy code ${code}`}>
      <code className="cb-code">{code}</code>
      <span className="cb-action">{copied ? "Copied" : "Copy code"}</span>
      <style>{`
        .cb { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: rgba(0,0,0,0.4); margin-top: 8px; cursor: pointer; transition: border-color 0.2s; width: 100%; text-align: left; }
        .cb:hover { border-color: var(--accent-border-subtle); }
        .cb-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.95rem; color: var(--accent); letter-spacing: 0.04em; }
        .cb-action { font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-muted); }
      `}</style>
    </button>
  );
}
