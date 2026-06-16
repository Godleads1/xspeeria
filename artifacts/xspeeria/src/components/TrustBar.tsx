export function TrustBar() {
  const items = [
    { type: "compliance", text: "✓ ISO 27001 Certified" },
    { type: "compliance", text: "✓ KYC / AML First" },
    { type: "compliance", text: "✓ Bank API Integrated" },
    { type: "compliance", text: "✓ AES-256 Encrypted" },
    { type: "compliance", text: "✓ Escrow-Only Settlement" },
    { type: "media", text: "📰 TechCabal Featured" },
    { type: "media", text: "📰 CNN Business" },
    { type: "media", text: "📰 Forbes Africa" },
    { type: "media", text: "📰 Nairametrics" },
  ];
  const doubled = [...items, ...items];

  return (
    <div id="trust" aria-label="Compliance and media recognition">
      <div className="trust-marquee-row">
        <div className="trust-track" aria-hidden="true">
          {doubled.map((item, i) => (
            <div key={i} className={item.type === "compliance" ? "compliance-pill" : "media-pill"}>
              {item.text}
            </div>
          ))}
        </div>
      </div>
      <div className="trust-tagline">Trusted Infrastructure · Regulated Corridors · Zero Custodial Risk</div>
    </div>
  );
}
