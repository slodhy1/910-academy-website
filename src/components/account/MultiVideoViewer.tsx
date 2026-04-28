import { VideoViewer } from "./VideoViewer";

export type ProductVideo = {
  id: string;
  vimeo_id: string;
  vimeo_hash: string | null;
  title: string;
  description: string | null;
  display_order: number;
};

export function MultiVideoViewer({ videos }: { videos: ProductVideo[] }) {
  if (!videos.length) {
    return (
      <div className="mvv-empty">
        <p>No videos available yet. Check back soon.</p>
        <style>{`
          .mvv-empty { padding: 48px 32px; border: 1px dashed var(--border); border-radius: var(--radius-md); text-align: center; color: var(--fg-muted); }
        `}</style>
      </div>
    );
  }

  return (
    <div className="mvv-wrap">
      {videos.map((v, i) => (
        <section key={v.id} className="mvv-section">
          <header className="mvv-head">
            <p className="mvv-eyebrow">Workshop {i + 1}</p>
            <h2 className="mvv-title">{v.title}</h2>
            {v.description && <p className="mvv-desc">{v.description}</p>}
          </header>
          <VideoViewer vimeoId={v.vimeo_id} vimeoHash={v.vimeo_hash} title={v.title} />
        </section>
      ))}
      <style>{`
        .mvv-wrap { display: flex; flex-direction: column; gap: 64px; }
        .mvv-section { display: flex; flex-direction: column; gap: 20px; }
        .mvv-head { display: flex; flex-direction: column; gap: 8px; max-width: 1100px; margin: 0 auto; width: 100%; }
        .mvv-eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 0.3em; text-transform: uppercase; color: var(--accent); }
        .mvv-title { font-size: clamp(1.2rem, 2.4vw, 1.6rem); font-weight: 500; color: var(--fg); }
        .mvv-desc { font-size: 0.95rem; color: var(--fg-muted); line-height: 1.6; }
      `}</style>
    </div>
  );
}
