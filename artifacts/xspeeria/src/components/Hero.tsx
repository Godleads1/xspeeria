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
      <div className="hero-orb hero-orb-1" aria-hidden="true" />
      <div className="hero-orb hero-orb-2" aria-hidden="true" />
      <div className="container">
        <div className="hero-grid">
          <div className="fade-up">
            <div className="badge">
              <div className="badge-dot" aria-hidden="true" />
              Peer-to-Peer FX Marketplace
            </div>
            <h1>
              Your Rate.<br />
              <span className="c-blue">Your Match.</span><br />
              <span className="c-mint">Zero Wallet Risk.</span>
            </h1>
            <p className="hero-sub">Exchange currency directly with verified peers across 8 countries. No banks. No hidden fees. No custodial wallets.</p>
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
                <div className="fx-flag" style={{ background: "rgba(26,86,219,.1)" }}>{pair.fromFlag}</div>
                <div className="fx-field">
                  <div className="fx-label">You Have</div>
                  <div className="fx-val">{pair.send.toLocaleString()}</div>
                </div>
                <div className="fx-cur">{pair.fromCur}</div>
              </div>
              <div className="fx-arrow" aria-hidden="true">
                <svg width="18" height="22" viewBox="0 0 20 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M10 3v18M4 16l6 6 6-6"/>
                </svg>
              </div>
              <div className="fx-row">
                <div className="fx-flag" style={{ background: "rgba(16,185,129,.1)" }}>{pair.toFlag}</div>
                <div className="fx-field">
                  <div className="fx-label">Peer Receives</div>
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
              <div>
                <div className="fx-label" style={{ marginBottom: "5px" }}>Active P2P Pairs</div>
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
