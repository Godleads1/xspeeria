import { useEffect, useRef } from "react";
import worldMap from "../assets/world-map.jpg";

export function AppDownload() {
  const ref = useRef<HTMLElement>(null);
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
          <div className="eyebrow" style={{ color: "var(--mint)" }}>Download the App</div>
          <h2 style={{ color: "#e8edf5" }}>Settlement Infrastructure.<br />In Your Pocket.</h2>
          <p style={{ color: "rgba(232,237,245,.65)", maxWidth: "540px", margin: "0 auto 36px" }}>
            Xspeeria is a regulated technology layer — not a bank, not a wallet. Match with verified peers and settle exclusively through licensed partner banks, from anywhere in the world.
          </p>

          <div className="store-buttons store-buttons-centered">
            <a href="#" className="store-btn store-btn-light" aria-label="Download on the App Store">
              <span className="store-btn-icon">🍎</span>
              <div>
                <div className="store-btn-label">Download on the</div>
                <div className="store-btn-name">App Store</div>
              </div>
            </a>
            <a href="#" className="store-btn store-btn-light" aria-label="Get it on Google Play">
              <span className="store-btn-icon">▶</span>
              <div>
                <div className="store-btn-label">Get it on</div>
                <div className="store-btn-name">Google Play</div>
              </div>
            </a>
          </div>

          <div className="app-features app-features-centered">
            {[
              "Live P2P rate matching — updated every 3 seconds",
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
