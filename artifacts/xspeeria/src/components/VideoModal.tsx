interface VideoModalProps {
  open: boolean;
  onClose: () => void;
}

export function VideoModal({ open, onClose }: VideoModalProps) {
  if (!open) return null;

  return (
    <div
      className={`modal-overlay${open ? " open" : ""}`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
    >
      <div className="modal-box">
        <button className="modal-close" onClick={onClose} aria-label="Close modal">✕</button>
        <div className="modal-play">
          <svg width="22" height="26" viewBox="0 0 12 14" fill="white"><path d="M1 1l10 6-10 6V1z"/></svg>
        </div>
        <h3>See Xspeeria in Action</h3>
        <p>Watch how a complete P2P FX exchange happens in under 60 seconds — from match to settlement.</p>
        <a href="#cta-footer" className="btn-primary" style={{ display: "inline-flex", margin: "0 auto" }} onClick={onClose}>
          Get Started Free
        </a>
      </div>
    </div>
  );
}
