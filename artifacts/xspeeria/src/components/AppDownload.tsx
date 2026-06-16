import { useEffect, useRef } from "react";

const VALID_SIZES = [20, 24, 32, 40, 48, 56, 64, 72, 80] as const;
function nearestSize(n: number) {
  return VALID_SIZES.reduce((a, b) => Math.abs(b - n) < Math.abs(a - n) ? b : a);
}
const Flag = ({ code, size = 16 }: { code: string; size?: number }) => {
  const s = nearestSize(size);
  return (
    <img
      src={`https://flagcdn.com/${s}x${Math.round(s * 0.75)}/${code}.png`}
      alt={code.toUpperCase()}
      width={size}
      height={Math.round(size * 0.75)}
      style={{ borderRadius: "2px", display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}
    />
  );
};

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
    <section id="app-download" ref={ref}>
      <div className="container">
        <div className="app-download-inner">
          <div className="app-download-text fade-up">
            <div className="eyebrow">Download the App</div>
            <h2>Exchange Currency.<br />Anywhere. Anytime.</h2>
            <p>
              The Xspeeria app puts a full P2P FX marketplace in your pocket. Match, escrow, and settle currency exchanges in under 60 seconds — directly from your phone.
            </p>
            <div className="store-buttons">
              <a href="#" className="store-btn" aria-label="Download on the App Store">
                <span className="store-btn-icon">🍎</span>
                <div>
                  <div className="store-btn-label">Download on the</div>
                  <div className="store-btn-name">App Store</div>
                </div>
              </a>
              <a href="#" className="store-btn" aria-label="Get it on Google Play">
                <span className="store-btn-icon">▶</span>
                <div>
                  <div className="store-btn-label">Get it on</div>
                  <div className="store-btn-name">Google Play</div>
                </div>
              </a>
            </div>
            <div className="app-features">
              {[
                "Live P2P rate matching — updated every 3 seconds",
                "Bank-linked escrow for every transaction",
                "Split transfers to multiple accounts",
                "Biometric login & AES-256 encryption",
                "Push notifications for matches & settlements",
              ].map((f) => (
                <div className="app-feature-item" key={f}>
                  <div className="app-feature-check">✓</div>
                  <span>{f}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="app-mockup fade-up" style={{ transitionDelay: ".15s" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "20px" }}>
              <div className="phone-frame">
                <div className="phone-notch" />
                <div className="phone-screen">
                  <div className="phone-app-header">Xspeeria</div>
                  <div className="phone-balance">
                    <div className="phone-balance-label">Active Exchange</div>
                    <div className="phone-balance-amount">$1,000 USD</div>
                    <div className="phone-balance-sub">→ 1,567,000 NGN · Peer matched ✓</div>
                  </div>
                  <div className="phone-actions">
                    <div className="phone-action">
                      <div className="phone-action-icon">💱</div>
                      <div className="phone-action-label">Exchange</div>
                    </div>
                    <div className="phone-action">
                      <div className="phone-action-icon">🤝</div>
                      <div className="phone-action-label">Match</div>
                    </div>
                    <div className="phone-action">
                      <div className="phone-action-icon">📊</div>
                      <div className="phone-action-label">Rates</div>
                    </div>
                    <div className="phone-action">
                      <div className="phone-action-icon">🏦</div>
                      <div className="phone-action-label">Settle</div>
                    </div>
                  </div>
                  <div className="phone-rate-row">
                    <div className="phone-rate-left" style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <Flag code="us" size={14} /> USD → <Flag code="ng" size={14} /> NGN
                    </div>
                    <div className="phone-rate-right">1 USD = 1,567 NGN</div>
                  </div>
                  <div className="phone-rate-row">
                    <div className="phone-rate-left" style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <Flag code="gb" size={14} /> GBP → <Flag code="ng" size={14} /> NGN
                    </div>
                    <div className="phone-rate-right">1 GBP = 2,040 NGN</div>
                  </div>
                  <div className="phone-home-bar" />
                </div>
              </div>
              <div className="app-qr-hint">
                <div className="app-qr-box">
                  <div className="app-qr-placeholder">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                      <rect x="3" y="14" width="7" height="7" rx="1"/>
                      <rect x="14" y="14" width="3" height="3" rx=".5"/>
                      <rect x="18" y="14" width="3" height="3" rx=".5"/>
                      <rect x="14" y="18" width="3" height="3" rx=".5"/>
                      <rect x="18" y="18" width="3" height="3" rx=".5"/>
                    </svg>
                  </div>
                  <div className="app-qr-label">Scan to download</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
