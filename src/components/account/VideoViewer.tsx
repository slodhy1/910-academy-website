type Props = {
  vimeoId: string;
  vimeoHash?: string | null;
  title?: string;
};

export function VideoViewer({ vimeoId, vimeoHash, title }: Props) {
  const qs = new URLSearchParams({
    badge: "0",
    autopause: "0",
    player_id: "0",
    app_id: "58479",
  });
  if (vimeoHash) qs.set("h", vimeoHash);
  const src = `https://player.vimeo.com/video/${vimeoId}?${qs.toString()}`;

  return (
    <div className="vv-wrap">
      <div className="vv-frame">
        <iframe
          src={src}
          title={title || "Workshop video"}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          loading="lazy"
        />
      </div>
      <style>{`
        .vv-wrap { width: 100%; max-width: 1100px; margin: 0 auto; }
        .vv-frame { position: relative; width: 100%; padding-top: 56.25%; border-radius: var(--radius-md); overflow: hidden; background: #000; border: 1px solid var(--border); }
        .vv-frame iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
      `}</style>
    </div>
  );
}
