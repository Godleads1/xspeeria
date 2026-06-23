import { useState, useEffect, useRef } from "react";

const FALLBACK: Record<string, number> = {
  "USD-NGN": 1371, "USD-KES": 129.4, "USD-GHS": 14.8,
  "GBP-NGN": 1780, "GBP-KES": 168.5, "GBP-GHS": 19.2,
  "CAD-NGN": 1010, "CAD-KES": 94.5, "CAD-GHS": 10.8,
  "AED-NGN": 373,  "AED-KES": 35.2, "AED-GHS": 4.0,
};
const currSymbols: Record<string, string> = { NGN: "₦", KES: "KSh", GHS: "GH₵" };

export function Calculator() {
  const [amount, setAmount] = useState(1000);
  const [from, setFrom] = useState("USD");
  const [to, setTo] = useState("NGN");
  const [liveRates, setLiveRates] = useState<Record<string, number>>(FALLBACK);
  const [ratesLabel, setRatesLabel] = useState("Illustrative mid-market estimates");
  const [customRate, setCustomRate] = useState<number | "">(0);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const PRIMARY = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json";
    const FALLBACK_URL = "https://latest.currency-api.pages.dev/v1/currencies/usd.json";
    const round = (n: number) => Math.round(n * 100) / 100;
    const apply = (data: { usd?: Record<string, number>; date?: string }) => {
      const r = data?.usd;
      if (!r) return;
      const ngn = r.ngn ?? FALLBACK["USD-NGN"];
      const kes = r.kes ?? FALLBACK["USD-KES"];
      const ghs = r.ghs ?? FALLBACK["USD-GHS"];
      const gbp = r.gbp ?? 1;
      const cad = r.cad ?? 1;
      const aed = r.aed ?? 1;
      const rates = {
        "USD-NGN": round(ngn),       "USD-KES": round(kes),       "USD-GHS": round(ghs),
        "GBP-NGN": round(ngn / gbp), "GBP-KES": round(kes / gbp), "GBP-GHS": round(ghs / gbp),
        "CAD-NGN": round(ngn / cad), "CAD-KES": round(kes / cad), "CAD-GHS": round(ghs / cad),
        "AED-NGN": round(ngn / aed), "AED-KES": round(kes / aed), "AED-GHS": round(ghs / aed),
      };
      setLiveRates(rates);
      setRatesLabel(`Live mid-market rate · ${data.date ?? "today"}`);
    };
    fetch(PRIMARY)
      .then((r) => r.json()).then(apply)
      .catch(() => fetch(FALLBACK_URL).then((r) => r.json()).then(apply).catch(() => {}));
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add("visible"); }),
      { threshold: 0.1 }
    );
    ref.current?.querySelectorAll(".fade-up").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const key = `${from}-${to}`;
  const officialRate = liveRates[key] ?? FALLBACK[key] ?? 1371;
  const sym = currSymbols[to] ?? "";

  useEffect(() => {
    setCustomRate(officialRate);
  }, [officialRate, from, to]);

  const myRate = typeof customRate === "number" && customRate > 0 ? customRate : officialRate;
  const buyerPaysYou = Math.round(amount * myRate);
  const atOfficialRate = Math.round(amount * officialRate);
  const diff = buyerPaysYou - atOfficialRate;
  const diffLabel = diff >= 0
    ? `+${sym}${Math.abs(diff).toLocaleString()} above official`
    : `${sym}${Math.abs(diff).toLocaleString()} below official`;
  const diffColor = diff >= 0 ? "var(--mint)" : "var(--red, #ef4444)";

  return (
    <section id="calculator" className="section-alt" ref={ref}>
      <div className="container">
        <div className="section-header fade-up">
          <div className="eyebrow"></div>
          <h2>Set Your Own Rate</h2>
          <p>On Xspeeria, you decide the rate you want. Post your listing — buyers find you and pay exactly what you set. All settlements through licensed partner banks.</p>
        </div>
        <div className="calc-grid fade-up">
          <div className="calc-form">
            <h3>Post Your Rate</h3>
            <p style={{ fontSize: ".86rem", color: "var(--text-sub)", marginBottom: "20px" }}>
              Set the rate you want to sell at. You're in control — buyers accept your terms.
            </p>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="calc-amount">I'm Selling</label>
                <input
                  type="number"
                  id="calc-amount"
                  value={amount}
                  min={1}
                  onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="calc-from">Currency</label>
                <select id="calc-from" value={from} onChange={(e) => setFrom(e.target.value)}>
                  <option value="USD">🇺🇸 USD</option>
                  <option value="GBP">🇬🇧 GBP</option>
                  <option value="CAD">🇨🇦 CAD</option>
                  <option value="AED">🇦🇪 AED</option>
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: "16px" }}>
              <label htmlFor="calc-to">Buyer Pays In</label>
              <select id="calc-to" value={to} onChange={(e) => setTo(e.target.value)}>
                <option value="NGN">🇳🇬 NGN — Nigerian Naira</option>
                <option value="KES">🇰🇪 KES — Kenyan Shilling</option>
                <option value="GHS">🇬🇭 GHS — Ghanaian Cedi</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: "8px" }}>
              <label htmlFor="calc-rate">
                My Rate ({sym} per {from})
                <span style={{ fontWeight: 400, color: "var(--text-dim)", marginLeft: 6, fontSize: ".78rem" }}>
                  — Official today: {sym}{officialRate.toLocaleString()}
                </span>
              </label>
              <input
                type="number"
                id="calc-rate"
                value={customRate}
                min={1}
                onChange={(e) => setCustomRate(parseFloat(e.target.value) || "")}
                placeholder={`e.g. ${officialRate}`}
                style={{ fontWeight: 700 }}
              />
            </div>
            <p style={{ fontSize: ".75rem", color: "var(--text-dim)" }}>
              * {ratesLabel}
            </p>
          </div>

          <div className="calc-result">
            <div className="result-main">
              <div className="result-label">Buyer Pays You</div>
              <div className="result-amount">{sym}{buyerPaysYou.toLocaleString()}</div>
              <div className="result-sub">for {from} {amount.toLocaleString()} at your rate</div>
            </div>

            <table className="comparison-table">
              <thead>
                <tr><th>Rate Scenario</th><th>You Receive</th><th>Difference</th></tr>
              </thead>
              <tbody>
                <tr className="highlight-row">
                  <td>✦ Your Rate ({sym}{myRate.toLocaleString()})</td>
                  <td>{sym}{buyerPaysYou.toLocaleString()}</td>
                  <td><span style={{ color: diffColor, fontWeight: 700, fontSize: ".78rem" }}>{diffLabel}</span></td>
                </tr>
                <tr>
                  <td>Official Mid-Market</td>
                  <td>{sym}{atOfficialRate.toLocaleString()}</td>
                  <td><span className="savings-tag">Reference</span></td>
                </tr>
                <tr>
                  <td>Traditional Bank</td>
                  <td>{sym}{Math.round(amount * officialRate * 0.96).toLocaleString()}</td>
                  <td><span className="loss-tag">−4% margin</span></td>
                </tr>
              </tbody>
            </table>

            <div style={{ marginTop: 16, padding: "12px 16px", background: "rgba(16,185,129,.08)", borderRadius: 10, border: "1px solid rgba(16,185,129,.2)", fontSize: ".8rem", color: "var(--text-sub)", lineHeight: 1.6 }}>
              <strong style={{ color: "var(--mint)" }}>How it works:</strong> Post your rate on Xspeeria. Buyers browsing the Exchange Network find your listing and accept your terms. Settlement flows instantly through our licensed banking partners — you never hold counterparty funds.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
