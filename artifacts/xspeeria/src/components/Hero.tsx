import { useEffect, useRef, useState } from "react";

const VALID_SIZES = [20, 24, 32, 40, 48, 56, 64, 72, 80] as const;
function nearestSize(n: number) {
  return VALID_SIZES.reduce((a, b) => Math.abs(b - n) < Math.abs(a - n) ? b : a);
}

const Flag = ({ code, size = 28 }: { code: string; size?: number }) => {
  const s = nearestSize(size);
  return (
    <img
      src={`https://flagcdn.com/${s}x${Math.round(s * 0.75)}/${code}.png`}
      alt={code.toUpperCase()}
      width={size}
      height={Math.round(size * 0.75)}
      style={{ borderRadius: "3px", display: "inline-block", flexShrink: 0 }}
    />
  );
};

const BASE_PAIRS = [
  { fromCode: "us", fromCur: "USD", toCode: "ng", toCur: "NGN", send: 1000 },
  { fromCode: "gb", fromCur: "GBP", toCode: "ng", toCur: "NGN", send: 1000 },
  { fromCode: "ca", fromCur: "CAD", toCode: "ng", toCur: "NGN", send: 1000 },
  { fromCode: "us", fromCur: "USD", toCode: "ke", toCur: "KES", send: 1000 },
];

const FALLBACK_RATES: Record<string, number> = {
  "USD-NGN": 1567, "GBP-NGN": 2040.5, "CAD-NGN": 1143.2, "USD-KES": 129.4,
};

export function Hero({ onVideoOpen }: { onVideoOpen: () => void }) {
  const [fxIdx, setFxIdx] = useState(0);
  const [recvOpacity, setRecvOpacity] = useState(1);
  const [rates, setRates] = useState<Record<string, number>>(FALLBACK_RATES);
  const [ticker, setTicker] = useState([
    { code: "gb", text: "GBP/NGN · 1 GBP = 2,040.50 NGN" },
    { code: "ca", text: "CAD/NGN · 1 CAD = 1,143.20 NGN" },
    { code: "ae", text: "AED/NGN · 1 AED = 426.80 NGN" },
    { code: "ke", text: "USD/KES · 1 USD = 129.40 KES" },
    { code: "gb", text: "GBP/NGN · 1 GBP = 2,040.50 NGN" },
  ]);
  const heroRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const PRIMARY = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json";
    const FALLBACK = "https://latest.currency-api.pages.dev/v1/currencies/usd.json";
    const load = (url: string): Promise<void> =>
      fetch(url)
        .then((r) => r.json())
        .then((data) => {
          const r = data?.usd as Record<string, number> | undefined;
          if (!r) return;
          const ngn = r.ngn ?? 1567;
          const kes = r.kes ?? 129.4;
          const gbp = r.gbp ?? 1;
          const cad = r.cad ?? 1;
          const aed = r.aed ?? 1;
          const round1 = (n: number) => Math.round(n * 10) / 10;
          setRates({
            "USD-NGN": round1(ngn),
            "GBP-NGN": round1(ngn / gbp),
            "CAD-NGN": round1(ngn / cad),
            "USD-KES": round1(kes),
          });
          const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          setTicker([
            { code: "gb", text: `GBP/NGN · 1 GBP = ${fmt(ngn / gbp)} NGN` },
            { code: "ca", text: `CAD/NGN · 1 CAD = ${fmt(ngn / cad)} NGN` },
            { code: "ae", text: `AED/NGN · 1 AED = ${fmt(ngn / aed)} NGN` },
            { code: "ke", text: `USD/KES · 1 USD = ${fmt(kes)} KES` },
            { code: "gb", text: `GBP/NGN · 1 GBP = ${fmt(ngn / gbp)} NGN` },
          ]);
        });
    load(PRIMARY).catch(() => load(FALLBACK).catch(() => {}));
  }, []);

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
        setFxIdx((i) => (i + 1) % BASE_PAIRS.length);
        setRecvOpacity(1);
      }, 300);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const pair = BASE_PAIRS[fxIdx];
  const rate = rates[`${pair.fromCur}-${pair.toCur}`] ?? FALLBACK_RATES[`${pair.fromCur}-${pair.toCur}`] ?? 1567;
  const recvVal = Math.round(pair.send * rate);

  return (
    <section id="hero" ref={heroRef}>
      <div className="container">
        <div className="hero-grid">
          <div className="fade-up">
            <div className="badge">
              <div className="badge-dot" aria-hidden="true" />
              Bank-Settled FX Infrastructure
            </div>

            <h1 className="hero-headline" aria-label="Exchange at the real market rate.">
              <span className="line line-1">Exchange</span>
              <span className="line line-2">at the real</span>
              <span className="line line-3 c-mint">market rate.</span>
            </h1>

            <p className="hero-sub">Connect with verified peers across 8 countries. Settlements flow through licensed partner banks — no custody, no hidden fees, just the mid-market rate.</p>

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

          <div className="slide-in-right">
            <div className="fx-widget" aria-label="Live FX rate widget">
              <div className="fx-header">
                <span className="fx-title">Live P2P Rate Engine</span>
                <div className="live-badge">
                  <div className="live-dot" aria-hidden="true" />
                  LIVE
                </div>
              </div>

              <div className="fx-row">
                <div className="fx-flag"><Flag code={pair.fromCode} size={32} /></div>
                <div className="fx-field">
                  <div className="fx-label">You Send</div>
                  <div className="fx-val">{pair.send.toLocaleString()}</div>
                </div>
                <div className="fx-cur">{pair.fromCur}</div>
              </div>

              <div className="fx-swap-row">
                <button className="fx-swap-btn" aria-label="Swap currencies" onClick={() => setFxIdx((i) => (i + 1) % BASE_PAIRS.length)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/>
                  </svg>
                </button>
              </div>

              <div className="fx-row">
                <div className="fx-flag"><Flag code={pair.toCode} size={32} /></div>
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
                <div className="rate-val">1 {pair.fromCur} = {rate.toLocaleString()} {pair.toCur}</div>
                <div className="rate-sub">Live mid-market rate · Bank-settled</div>
              </div>

              <div className="compare-row">
                <div className="cmp-card cmp-good">
                  <div className="cmp-label">✓ Xspeeria</div>
                  <div className="cmp-text">No custody · mid-market rate · bank-settled</div>
                </div>
                <div className="cmp-card cmp-bad">
                  <div className="cmp-label">✕ Bank FX Desks</div>
                  <div className="cmp-text" style={{ color: "var(--red)" }}>3–7% FX margin · slow · opaque fees</div>
                </div>
              </div>

              <button className="fx-cta">Start Exchange →</button>

              <div>
                <div className="fx-label" style={{ marginBottom: "5px", marginTop: "14px" }}>Active P2P Pairs</div>
                <div className="ticker-wrap" aria-label="Active currency pairs">
                  <div className="ticker-inner">
                    {ticker.map((item, i) => (
                      <div className="ticker-item" key={i} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <Flag code={item.code} size={14} />
                        {item.text}
                      </div>
                    ))}
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
