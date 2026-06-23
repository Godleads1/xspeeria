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
  { code: "gb", name: "United Kingdom", reg: "FCA-aligned" },
  { code: "ca", name: "Canada", reg: "FINTRAC · Corp HQ" },
  { code: "ng", name: "Nigeria", reg: "CBN-compliant" },
  { code: "ae", name: "UAE", reg: "CBUAE-aligned" },
  { code: "us", name: "United States", reg: "FinCEN-registered" },
  { code: "ke", name: "Kenya", reg: "CBK-compliant" },
  { code: "gh", name: "Ghana", reg: "BoG-compliant" },
  { code: "in", name: "India", reg: "RBI-aligned" },
];

const marqueeItems = [...countries, ...countries];

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
          <div className="eyebrow">Active Corridors</div>
          <h2>Global Rails. Local Trust.</h2>
          <p>Xspeeria integrates with banking infrastructure across eight high-diaspora corridors — built to serve people who move money across borders every day.</p>
        </div>

        <div className="fade-up" style={{
          border: "1px solid var(--bg-border)",
          borderRadius: 16,
          overflow: "hidden",
          marginBottom: 40,
          background: "var(--bg-card, rgba(255,255,255,.6))",
        }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--bg-border)", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--mint)", boxShadow: "0 0 6px var(--mint)" }} />
            <span style={{ fontSize: ".75rem", fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase", color: "var(--text-sub)" }}>
              Active &amp; Expanding Corridors
            </span>
          </div>
          <div style={{ padding: "20px 0", overflow: "hidden", position: "relative" }}>
            <div style={{ display: "flex", gap: 24, animation: "marquee 18s linear infinite", width: "max-content" }}>
              {marqueeItems.map((item, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 20px", borderRadius: 10,
                  background: "rgba(16,185,129,.06)", border: "1px solid rgba(16,185,129,.14)",
                  whiteSpace: "nowrap",
                }}>
                  <Flag code={item.code} size={24} />
                  <span style={{ fontWeight: 600, fontSize: ".88rem", color: "var(--text-main)" }}>{item.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="countries-grid">
          {countries.map((c, i) => (
            <div className="country-card fade-up" key={c.name} style={{ transitionDelay: `${i * 0.07}s` }}>
              <div className="country-flag" style={{ fontSize: "unset" }}>
                <Flag code={c.code} size={40} />
              </div>
              <div className="country-name">{c.name}</div>
              <div className="country-reg">{c.reg}</div>
              <span className="country-status status-active">Ongoing</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
