import { useEffect, useRef, useState } from "react";
import worldMap from "../assets/world-map.jpg";

export function AppDownload() {
  const ref = useRef<HTMLElement>(null);
  const [showToast, setShowToast] = useState(false);

  const handleStoreClick = () => {
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2500);
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add("visible"); }),
      { threshold: 0.1 }
    );
    ref.current?.querySelectorAll(".fade-up").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <section id="app-download" ref={ref} style={{
      position: "relative",
      overflow: "hidden",
      backgroundImage: `url(${worldMap})`,
      backgroundSize: "cover",
      backgroundPosition: "center 40%",
      backgroundRepeat: "no-repeat",
    }}>
      {/* Dark overlay so text stays readable */}
      <div aria-hidden="true" style={{
        position: "absolute",
        inset: 0,
        background: "linear-gradient(to bottom, rgba(4,8,15,.45) 0%, rgba(4,8,15,.6) 100%)",
        zIndex: 0,
      }} />

      <div className="container" style={{ position: "relative", zIndex: 1 }}>
        <div className="app-download-centered fade-up">
          <div className="eyebrow" style={{ color: "var(--mint)" }}></div>
          <h2 style={{ color: "#e8edf5" }}>Settlement Infrastructure.<br />In Your Pocket.</h2>
          <p style={{ color: "rgba(232,237,245,.65)", maxWidth: "540px", margin: "0 auto 36px" }}>
            Xspeeria is a regulated technology layer — not a bank, not a wallet. Match with verified peers and settle exclusively through licensed partner banks, from anywhere in the world.
          </p>

          <div className="store-buttons store-buttons-centered">
            <button onClick={handleStoreClick} className="store-btn store-btn-light" aria-label="Download on the App Store">
              <span className="store-btn-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.029 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/></svg>
              </span>
              <div>
                <div className="store-btn-label">Download on the</div>
                <div className="store-btn-name">App Store</div>
              </div>
            </button>
            <button onClick={handleStoreClick} className="store-btn store-btn-light" aria-label="Get it on Google Play">
              <span className="store-btn-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M3.18 23.76c.3.17.64.24.99.19L15.5 12 11.67 8.17 3.18 23.76z" fill="#EA4335"/><path d="M20.82 10.55 17.5 8.67 13.33 12l4.17 4.17 3.32-1.88c.95-.54.95-1.82 0-2.74z" fill="#FBBC05"/><path d="M3.18.24A1.5 1.5 0 0 0 2.5 1.5v21a1.5 1.5 0 0 0 .68 1.26L15.5 12 3.18.24z" fill="#4285F4"/><path d="M15.5 12 3.18 23.76c.35.2.78.2 1.13 0L17.5 16.17 15.5 12z" fill="#34A853"/></svg>
              </span>
              <div>
                <div className="store-btn-label">Get it on</div>
                <div className="store-btn-name">Google Play</div>
              </div>
            </button>
          </div>
          {showToast && (
            <div className="store-toast" role="alert">🚀 Not Available Yet — Coming Soon!</div>
          )}

          <div className="app-features app-features-centered">
            {[
              "Live community rate matching — updated every 3 seconds",
              "Bank-settled — licensed partner institutions only",
              "Split transfers to multiple accounts",
              "Biometric login & AES-256 encryption",
              "Push notifications for matches & settlements",
            ].map((f) => (
              <div className="app-feature-item app-feature-item-light" key={f}>
                <div className="app-feature-check">✓</div>
                <span>{f}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
