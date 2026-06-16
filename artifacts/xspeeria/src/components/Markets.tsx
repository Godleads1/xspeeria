import { useEffect, useRef } from "react";

const countries = [
  { flag: "🇬🇧", name: "United Kingdom", reg: "FCA-aligned", status: "Live Q2 2025", active: true },
  { flag: "🇨🇦", name: "Canada", reg: "FINTRAC · Corp HQ", status: "Active", active: true },
  { flag: "🇳🇬", name: "Nigeria", reg: "CBN-compliant", status: "Active", active: true },
  { flag: "🇦🇪", name: "UAE", reg: "CBUAE-aligned", status: "Active", active: true },
  { flag: "🇺🇸", name: "United States", reg: "FinCEN-registered", status: "Q3 2025", active: false },
  { flag: "🇰🇪", name: "Kenya", reg: "CBK-compliant", status: "Live Q2 2025", active: true },
  { flag: "🇬🇭", name: "Ghana", reg: "BoG-compliant", status: "Q3 2025", active: false },
  { flag: "🇮🇳", name: "India", reg: "RBI-aligned", status: "Q4 2025", active: false },
];

const mapNodes = [
  { flag: "🇬🇧", label: "UK", delay: "0s" },
  { flag: "🇨🇦", label: "Canada", delay: ".3s" },
  { flag: "🇳🇬", label: "Nigeria", delay: ".6s" },
  { flag: "🇦🇪", label: "UAE", delay: ".9s" },
  { flag: "🇺🇸", label: "USA", delay: "1.2s" },
  { flag: "🇰🇪", label: "Kenya", delay: "1.5s" },
  { flag: "🇬🇭", label: "Ghana", delay: "1.8s" },
  { flag: "🇮🇳", label: "India", delay: "2.1s" },
];

const marqueeItems = ["🇬🇧 United Kingdom", "🇨🇦 Canada", "🇳🇬 Nigeria", "🇦🇪 UAE", "🇺🇸 United States", "🇰🇪 Kenya", "🇬🇭 Ghana", "🇮🇳 India"];

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
                <div className="map-node-flag">{node.flag}</div>
                <div className="map-node-label">{node.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="markets-marquee-wrap" aria-hidden="true">
          <div className="markets-track">
            {[...marqueeItems, ...marqueeItems].map((item, i) => (
              <span className="market-name-pill" key={i}>{item}</span>
            ))}
          </div>
        </div>
        <div className="countries-grid fade-up">
          {countries.map((c) => (
            <div className="country-card" key={c.name}>
              <div className="country-flag">{c.flag}</div>
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
