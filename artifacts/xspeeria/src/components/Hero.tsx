import { useEffect, useRef, useState } from "react";

const fxPairs = [
  { fromFlag: "🇺🇸", fromCur: "USD", toFlag: "🇳🇬", toCur: "NGN", rate: 1567, send: 1000 },
  { fromFlag: "🇬🇧", fromCur: "GBP", toFlag: "🇳🇬", toCur: "NGN", rate: 2040.5, send: 1000 },
  { fromFlag: "🇨🇦", fromCur: "CAD", toFlag: "🇳🇬", toCur: "NGN", rate: 1143.2, send: 1000 },
  { fromFlag: "🇺🇸", fromCur: "USD", toFlag: "🇰🇪", toCur: "KES", rate: 129.4, send: 1000 },
];

export function Hero({ onVideoOpen }: { onVideoOpen: () => void }) {
  const [fxIdx, setFxIdx] = useState(0);
  const [recvOpacity, setRecvOpacity] = useState(1);
  const heroRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add("visible"); }),
      { threshold: 0.1 }
    );
    heroRef.current?.querySelectorAll(".fade-up").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setRecvOpacity(0.3);
      setTimeout(() => {
        setFxIdx((i) => (i + 1) % fxPairs.length);
        setRecvOpacity(1);
      }, 300);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const pair = fxPairs[fxIdx];
  const recvVal = Math.round(pair.send * pair.rate);

  return (
    <section id="hero" ref={heroRef}>
      <div className="container">
        <div className="hero-grid">
          <div className="fade-up">
            <div className="badge">
              <div className="badge-dot" aria-hidden="true" />
              Peer-to-Peer FX Marketplace
            </div>

            <h1 className="hero-headline" aria-label="Exchange at the real market rate.">
              <span className="line line-1">Exchange</span>
              <span className="line line-2">at the real</span>
              <span className="line line-3 c-mint">market rate.</span>
            </h1>

            <p className="hero-sub">Send money directly to verified peers across 8 countries. No banks. No hidden fees. No custodial wallets — just the mid-market rate.</p>

            <div className="hero-trust" aria-label="User ratings">
              <div className="hero-stars" aria-label="5 out of 5 stars">★★★★★</div>
              <span className="hero-rating-text"><strong>4.9</strong> · Trusted by <strong>50,000+</strong> users</span>
            </div>

            <div className="hero-ctas">
              <a href="#cta-footer" className="btn-primary">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
                Start Exchanging
              </a>
              <button className="btn-secondary" onClick={onVideoOpen} aria-label="Watch how Xspeeria works">
                <span className="play-ring">
                  <svg width="11" height="13" viewBox="0 0 12 14" fill="currentColor"><path d="M1 1l10 6-10 6V1z"/></svg>
                </span>
                See How It Works
              </button>
            </div>

            <div className="hero-store-badges" aria-label="Download the app">
              <a href="#app-download" className="hero-store-btn" aria-label="Download on the App Store">
                <span className="hero-store-btn-icon">🍎</span>
                <div>
                  <div className="hero-store-btn-label">Download on the</div>
                  <div className="hero-store-btn-name">App Store</div>
                </div>
              </a>
              <a href="#app-download" className="hero-store-btn" aria-label="Get it on Google Play">
                <span className="hero-store-btn-icon">▶</span>
                <div>
                  <div className="hero-store-btn-label">Get it on</div>
                  <div className="hero-store-btn-name">Google Play</div>
                </div>
              </a>
            </div>

            <div className="social-proof" aria-label="Platform statistics">
              <div className="sp-item">
                <div>
                  <div className="sp-num">50,000+</div>
                  <div className="sp-label">Exchanges</div>
                </div>
              </div>
              <div className="sp-dot" />
              <div className="sp-item">
                <div>
                  <div className="sp-num">$12M+</div>
                  <div className="sp-label">Volume</div>
                </div>
              </div>
              <div className="sp-dot" />
              <div className="sp-item">
                <div>
                  <div className="sp-num">8</div>
                  <div className="sp-label">Countries</div>
                </div>
              </div>
            </div>
          </div>

          <div className="fade-up" style={{ transitionDelay: ".15s" }}>
            <div className="fx-widget" aria-label="Live FX rate widget">
              <div className="fx-header">
                <span className="fx-title">Live P2P Rate Engine</span>
                <div className="live-badge">
                  <div className="live-dot" aria-hidden="true" />
                  LIVE
                </div>
              </div>

              <div className="fx-row">
                <div className="fx-flag">{pair.fromFlag}</div>
                <div className="fx-field">
                  <div className="fx-label">You Send</div>
                  <div className="fx-val">{pair.send.toLocaleString()}</div>
                </div>
                <div className="fx-cur">{pair.fromCur}</div>
              </div>

              <div className="fx-swap-row">
                <button className="fx-swap-btn" aria-label="Swap currencies" onClick={() => setFxIdx((i) => (i + 1) % fxPairs.length)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/>
                  </svg>
                </button>
              </div>

              <div className="fx-row">
                <div className="fx-flag">{pair.toFlag}</div>
                <div className="fx-field">
                  <div className="fx-label">They Receive</div>
                  <div className="fx-val" style={{ color: "var(--mint)", opacity: recvOpacity, transition: "opacity .3s" }}>
                    {recvVal.toLocaleString()}
                  </div>
                </div>
                <div className="fx-cur">{pair.toCur}</div>
              </div>

              <div className="rate-bar">
                <div className="fx-label" style={{ marginBottom: "4px" }}>Mid-Market P2P Rate</div>
                <div className="rate-val">1 {pair.fromCur} = {pair.rate.toLocaleString()} {pair.toCur}</div>
                <div className="rate-sub">Updated 3s ago · Based on live peer offers</div>
              </div>

              <div className="compare-row">
                <div className="cmp-card cmp-good">
                  <div className="cmp-label">✓ Xspeeria</div>
                  <div className="cmp-text">0% wallet risk · mid-market rate · direct P2P</div>
                </div>
                <div className="cmp-card cmp-bad">
                  <div className="cmp-label">✕ Banks</div>
                  <div className="cmp-text" style={{ color: "var(--red)" }}>3–7% margin · slow · opaque fees</div>
                </div>
              </div>

              <button className="fx-cta">
                Start Exchange →
              </button>

              <div>
                <div className="fx-label" style={{ marginBottom: "5px", marginTop: "14px" }}>Active P2P Pairs</div>
                <div className="ticker-wrap" aria-label="Active currency pairs">
                  <div className="ticker-inner">
                    <div className="ticker-item">🇬🇧 GBP/NGN · 1 GBP = 2,040.50 NGN</div>
                    <div className="ticker-item">🇨🇦 CAD/NGN · 1 CAD = 1,143.20 NGN</div>
                    <div className="ticker-item">🇦🇪 AED/NGN · 1 AED = 426.80 NGN</div>
                    <div className="ticker-item">🇰🇪 USD/KES · 1 USD = 129.40 KES</div>
                    <div className="ticker-item">🇬🇧 GBP/NGN · 1 GBP = 2,040.50 NGN</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
