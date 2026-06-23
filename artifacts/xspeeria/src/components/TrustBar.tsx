import { useEffect, useRef } from "react";

const pressLogos = [
  { name: "Arise News", icon: "📺" },
  { name: "Channels TV", icon: "📡" },
  { name: "BusinessDay", icon: "📰" },
  { name: "TechCabal", icon: "📱" },
  { name: "Bloomberg", icon: "📊" },
  { name: "Forbes", icon: "🏆" },
];

const complianceItems = [
  { type: "compliance", text: "✓ ISO 27001 Certified" },
  { type: "compliance", text: "✓ KYC / AML First" },
  { type: "compliance", text: "✓ Bank API Integrated" },
  { type: "compliance", text: "✓ AES-256 Encrypted" },
  { type: "compliance", text: "✓ Bank-Settled · No Custody" },
  { type: "compliance", text: "✓ FCA-Aligned" },
  { type: "compliance", text: "✓ CBN-Compliant" },
  { type: "compliance", text: "✓ FINTRAC Licensed" },
];

const doubled = [...complianceItems, ...complianceItems];

export function TrustBar() {
  const pressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const logos = pressRef.current?.querySelectorAll<HTMLElement>(".press-logo-item");
    if (!logos) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            logos.forEach((logo, i) => {
              setTimeout(() => logo.classList.add("visible"), i * 100);
            });
            observer.disconnect();
          }
        });
      },
      { threshold: 0.2 }
    );

    if (pressRef.current) observer.observe(pressRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div id="press-bar" aria-label="As seen in press" ref={pressRef}>
        <div className="container">
          <p className="press-label"></p>
          <div className="press-logos">
            {pressLogos.map((p) => (
              <div key={p.name} className="press-logo-item">
                <span className="press-logo-icon">{p.icon}</span>
                <span>{p.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div id="trust" aria-label="Compliance and regulatory recognition">
        <div className="trust-marquee-row">
          <div className="trust-track" aria-hidden="true">
            {doubled.map((item, i) => (
              <div key={i} className="compliance-pill">
                {item.text}
              </div>
            ))}
          </div>
        </div>
        <div className="trust-tagline">Trusted Infrastructure · Regulated Corridors · Zero Custodial Risk</div>
      </div>
    </>
  );
}
