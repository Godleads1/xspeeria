import { useState, useEffect, useRef } from "react";

const calcRates: Record<string, number> = {
  "USD-NGN": 1567, "USD-KES": 129.4, "USD-GHS": 14.8,
  "GBP-NGN": 2040, "GBP-KES": 168.5, "GBP-GHS": 19.2,
  "CAD-NGN": 1143, "CAD-KES": 94.5, "CAD-GHS": 10.8,
  "AED-NGN": 426.8, "AED-KES": 35.2, "AED-GHS": 4.0,
};
const currSymbols: Record<string, string> = { NGN: "₦", KES: "KSh", GHS: "GH₵" };

export function Calculator() {
  const [amount, setAmount] = useState(1000);
  const [from, setFrom] = useState("USD");
  const [to, setTo] = useState("NGN");
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add("visible"); }),
      { threshold: 0.1 }
    );
    ref.current?.querySelectorAll(".fade-up").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const key = `${from}-${to}`;
  const rate = calcRates[key] ?? 1567;
  const sym = currSymbols[to] ?? "";
  const xspRecv = Math.round(amount * rate);
  const bankRecv = Math.round(xspRecv * 0.95);
  const walletRecv = Math.round(xspRecv * 0.97);
  const savingsVsBank = xspRecv - bankRecv;
  const savingsVsWallet = xspRecv - walletRecv;

  return (
    <section id="calculator" className="section-alt" ref={ref}>
      <div className="container">
        <div className="section-header fade-up">
          <div className="eyebrow">Savings Calculator</div>
          <h2>See What You Save</h2>
          <p>Enter an amount and currency pair — see exactly how much more stays in your pocket with Xspeeria.</p>
        </div>
        <div className="calc-grid fade-up">
          <div className="calc-form">
            <h3>Calculate Your Savings</h3>
            <p>Compare Xspeeria vs banks and wallets in real time.</p>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="calc-amount">Amount</label>
                <input
                  type="number"
                  id="calc-amount"
                  value={amount}
                  min={1}
                  onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="calc-from">From Currency</label>
                <select id="calc-from" value={from} onChange={(e) => setFrom(e.target.value)}>
                  <option value="USD">🇺🇸 USD</option>
                  <option value="GBP">🇬🇧 GBP</option>
                  <option value="CAD">🇨🇦 CAD</option>
                  <option value="AED">🇦🇪 AED</option>
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: "20px" }}>
              <label htmlFor="calc-to">To Currency</label>
              <select id="calc-to" value={to} onChange={(e) => setTo(e.target.value)}>
                <option value="NGN">🇳🇬 NGN — Nigerian Naira</option>
                <option value="KES">🇰🇪 KES — Kenyan Shilling</option>
                <option value="GHS">🇬🇭 GHS — Ghanaian Cedi</option>
              </select>
            </div>
            <p style={{ fontSize: ".78rem", color: "var(--text-dim)" }}>
              * Rates are illustrative mid-market estimates for demonstration purposes.
            </p>
          </div>
          <div className="calc-result">
            <div className="result-main">
              <div className="result-label">You Save vs Banks</div>
              <div className="result-amount">{sym}{savingsVsBank.toLocaleString()}</div>
              <div className="result-sub">on a {from} {amount.toLocaleString()} exchange</div>
            </div>
            <table className="comparison-table">
              <thead>
                <tr><th>Platform</th><th>Peer Receives</th><th>vs Xspeeria</th></tr>
              </thead>
              <tbody>
                <tr className="highlight-row">
                  <td>✦ Xspeeria</td>
                  <td>{sym}{xspRecv.toLocaleString()}</td>
                  <td><span className="savings-tag">Best</span></td>
                </tr>
                <tr>
                  <td>Traditional Banks</td>
                  <td>{sym}{bankRecv.toLocaleString()}</td>
                  <td><span className="loss-tag">−{sym}{savingsVsBank.toLocaleString()}</span></td>
                </tr>
                <tr>
                  <td>Wallet Apps</td>
                  <td>{sym}{walletRecv.toLocaleString()}</td>
                  <td><span className="loss-tag">−{sym}{savingsVsWallet.toLocaleString()}</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
