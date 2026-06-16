const pressLogos = [
  { name: "TechCrunch", icon: "🟠" },
  { name: "Forbes", icon: "📊" },
  { name: "Bloomberg", icon: "📰" },
  { name: "CNN Business", icon: "📡" },
  { name: "Y Combinator", icon: "🔶" },
  { name: "TechCabal", icon: "📱" },
];

const complianceItems = [
  { type: "compliance", text: "✓ ISO 27001 Certified" },
  { type: "compliance", text: "✓ KYC / AML First" },
  { type: "compliance", text: "✓ Bank API Integrated" },
  { type: "compliance", text: "✓ AES-256 Encrypted" },
  { type: "compliance", text: "✓ Escrow-Only Settlement" },
  { type: "compliance", text: "✓ FCA-Aligned" },
  { type: "compliance", text: "✓ CBN-Compliant" },
  { type: "compliance", text: "✓ FINTRAC Licensed" },
];

const doubled = [...complianceItems, ...complianceItems];

export function TrustBar() {
  return (
    <>
      <div id="press-bar" aria-label="As seen in press">
        <div className="container">
          <p className="press-label">As seen in</p>
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
