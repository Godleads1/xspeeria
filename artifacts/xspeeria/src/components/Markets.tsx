import { useEffect, useRef } from "react";

const VALID_SIZES = [20, 24, 32, 40, 48, 56, 64, 72, 80] as const;
function nearestSize(n: number) {
  return VALID_SIZES.reduce((a, b) => Math.abs(b - n) < Math.abs(a - n) ? b : a);
}

const Flag = ({ code, size = 24 }: { code: string; size?: number }) => {
  const s = nearestSize(size);
  return (
    <img
      src={`https://flagcdn.com/${s}x${Math.round(s * 0.75)}/${code}.png`}
      alt={code.toUpperCase()}
      width={size}
      height={Math.round(size * 0.75)}
      style={{ borderRadius: "2px", display: "inline-block", flexShrink: 0 }}
    />
  );
};

const countries = [
  { code: "gb", name: "United Kingdom", reg: "FCA-aligned", status: "Live Q2 2025", active: true },
  { code: "ca", name: "Canada", reg: "FINTRAC · Corp HQ", status: "Active", active: true },
  { code: "ng", name: "Nigeria", reg: "CBN-compliant", status: "Active", active: true },
  { code: "ae", name: "UAE", reg: "CBUAE-aligned", status: "Active", active: true },
  { code: "us", name: "United States", reg: "FinCEN-registered", status: "Q3 2025", active: false },
  { code: "ke", name: "Kenya", reg: "CBK-compliant", status: "Live Q2 2025", active: true },
  { code: "gh", name: "Ghana", reg: "BoG-compliant", status: "Q3 2025", active: false },
  { code: "in", name: "India", reg: "RBI-aligned", status: "Q4 2025", active: false },
];

const mapNodes = [
  { code: "gb", label: "UK", delay: "0s" },
  { code: "ca", label: "Canada", delay: ".3s" },
  { code: "ng", label: "Nigeria", delay: ".6s" },
  { code: "ae", label: "UAE", delay: ".9s" },
  { code: "us", label: "USA", delay: "1.2s" },
  { code: "ke", label: "Kenya", delay: "1.5s" },
  { code: "gh", label: "Ghana", delay: "1.8s" },
  { code: "in", label: "India", delay: "2.1s" },
];

const marqueeItems = [
  { code: "gb", name: "United Kingdom" },
  { code: "ca", name: "Canada" },
  { code: "ng", name: "Nigeria" },
  { code: "ae", name: "UAE" },
  { code: "us", name: "United States" },
  { code: "ke", name: "Kenya" },
  { code: "gh", name: "Ghana" },
  { code: "in", name: "India" },
];

export function Markets() {
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
    <section id="markets" className="section-alt" ref={ref}>
      <div className="container">
        <div className="section-header fade-up">
          <div className="eyebrow">Global Markets</div>
          <h2>Global Rails. Local Trust.</h2>
          <p>Xspeeria integrates with banking infrastructure across eight high-diaspora corridors — built to serve people who move money across borders every day.</p>
        </div>
        <div className="map-visual fade-up" aria-label="Countries where Xspeeria operates">
          <div className="map-grid-dots" aria-hidden="true" />
          <div className="map-title">Active &amp; Expanding Corridors</div>
          <div className="map-dots-container">
            {mapNodes.map((node) => (
              <div className="map-node" key={node.label}>
                <div className="map-node-dot" style={{ animationDelay: node.delay }} />
                <div className="map-node-flag">
                  <Flag code={node.code} size={28} />
                </div>
                <div className="map-node-label">{node.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="markets-marquee-wrap" aria-hidden="true">
          <div className="markets-track">
            {[...marqueeItems, ...marqueeItems].map((item, i) => (
              <span className="market-name-pill" key={i} style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                <Flag code={item.code} size={16} />
                {item.name}
              </span>
            ))}
          </div>
        </div>
        <div className="countries-grid fade-up">
          {countries.map((c) => (
            <div className="country-card" key={c.name}>
              <div className="country-flag" style={{ fontSize: "unset" }}>
                <Flag code={c.code} size={40} />
              </div>
              <div className="country-name">{c.name}</div>
              <div className="country-reg">{c.reg}</div>
              <span className={`country-status ${c.active ? "status-active" : "status-soon"}`}>{c.status}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
