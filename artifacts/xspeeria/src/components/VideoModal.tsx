interface VideoModalProps {
  open: boolean;
  onClose: () => void;
  videoUrl?: string;
}

function toEmbedUrl(url: string): string {
  if (!url) return "";
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&rel=0`;
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1`;
  return url;
}

export function VideoModal({ open, onClose, videoUrl = "" }: VideoModalProps) {
  if (!open) return null;
  const embedUrl = toEmbedUrl(videoUrl);

  return (
    <div
      className={`modal-overlay${open ? " open" : ""}`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
    >
      <div className="modal-box" style={embedUrl ? { maxWidth: 760, padding: "20px 20px 24px" } : undefined}>
        <button className="modal-close" onClick={onClose} aria-label="Close modal">✕</button>

        {embedUrl ? (
          <>
            <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
              <iframe
                src={embedUrl}
                title="Xspeeria — See How It Works"
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
                style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }}
              />
            </div>
            <a href="#cta-footer" className="btn-primary" style={{ display: "inline-flex", margin: "0 auto" }} onClick={onClose}>
              Get Started Free
            </a>
          </>
        ) : (
          <>
            <div className="modal-play">
              <svg width="22" height="26" viewBox="0 0 12 14" fill="white"><path d="M1 1l10 6-10 6V1z"/></svg>
            </div>
            <h3>See Xspeeria in Action</h3>
            <p>Watch how a complete P2P FX exchange happens in under 60 seconds — from match to settlement.</p>
            <a href="#cta-footer" className="btn-primary" style={{ display: "inline-flex", margin: "0 auto" }} onClick={onClose}>
              Get Started Free
            </a>
          </>
        )}
      </div>
    </div>
  );
}
