type Props = {
  signedUrl: string;
  filename?: string;
};

export function PdfViewer({ signedUrl, filename }: Props) {
  const iframeSrc = `${signedUrl}#toolbar=1&navpanes=1&scrollbar=1`;
  return (
    <div className="pv-wrap">
      <div className="pv-toolbar">
        <a href={signedUrl} download={filename || true} className="pv-download">
          Download PDF
        </a>
      </div>
      <div className="pv-frame">
        <iframe src={iframeSrc} title="Product PDF" />
      </div>
      <p className="pv-note">
        If the PDF doesn&apos;t load, refresh the page (signed URLs expire after 1 hour).
      </p>
      <style>{`
        .pv-wrap { display: flex; flex-direction: column; gap: 16px; max-width: 1100px; margin: 0 auto; width: 100%; }
        .pv-toolbar { display: flex; justify-content: flex-end; }
        .pv-download { padding: 10px 18px; border-radius: var(--radius-sm); border: 1px solid var(--accent); background: var(--accent-subtle); color: var(--accent); font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; transition: all 0.2s; }
        .pv-download:hover { background: var(--accent); color: #000; }
        .pv-frame { width: 100%; height: 80vh; border-radius: var(--radius-md); overflow: hidden; border: 1px solid var(--border); background: #000; }
        .pv-frame iframe { width: 100%; height: 100%; border: 0; background: #1a1a1a; }
        .pv-note { font-size: 12px; color: var(--fg-dim); text-align: center; }
      `}</style>
    </div>
  );
}
