import { useState, useEffect, useRef } from "react";

const steps = [
  {
    tab: "1. Onboard",
    num: "01", title: "Quick KYC Onboarding",
    desc: "Sign up with country-specific identity verification. Our adaptive KYC engine is calibrated for each jurisdiction — onboarding takes under 3 minutes for most users.",
    items: [
      { icon: "🪪", bg: "rgba(16,185,129,.1)", label: "Identity Verified", sub: "National ID · Passport · BVN / NIN" },
      { icon: "🏦", bg: "rgba(26,86,219,.1)", label: "Bank Account Linked", sub: "Secure API bank connection" },
      { icon: "✅", bg: "rgba(245,158,11,.1)", label: "Compliance Cleared", sub: "AML screen · sanction check" },
    ],
    pips: [true, false, false, false, false, false],
  },
  {
    tab: "2. Set Intent",
    num: "02", title: "Define Your Exchange Intent",
    desc: "Tell Xspeeria what you want: source currency, target currency, amount, and your rate threshold. Your offer queues into the live P2P order book instantly.",
    items: [
      { icon: "💱", bg: "rgba(26,86,219,.1)", label: "Currency Pair Set", sub: "USD → NGN · GBP → KES · CAD → GHS" },
      { icon: "🎯", bg: "rgba(16,185,129,.1)", label: "Target Rate Locked", sub: "Your minimum acceptable rate" },
      { icon: "📋", bg: "rgba(245,158,11,.1)", label: "Offer Listed", sub: "Visible to matching peers instantly" },
    ],
    pips: [true, true, false, false, false, false],
  },
  {
    tab: "3. Match",
    num: "03", title: "Smart Auto-Matching",
    desc: "Our algorithm scans compatible peer offers in real-time. When a match is found, both parties receive instant notification to confirm before any funds move.",
    items: [
      { icon: "⚡", bg: "rgba(139,92,246,.1)", label: "Match Found", sub: "Sub-second algorithmic scan" },
      { icon: "🔔", bg: "rgba(16,185,129,.1)", label: "Both Parties Notified", sub: "Push + in-app confirmation" },
      { icon: "🤝", bg: "rgba(26,86,219,.1)", label: "Deal Confirmed", sub: "Mutual consent before escrow" },
    ],
    pips: [true, true, true, false, false, false],
  },
  {
    tab: "4. Escrow",
    num: "04", title: "Escrow Transfer",
    desc: "Both parties transfer currencies into Xspeeria's bank-linked escrow. Funds are locked and verifiable — neither party can retrieve them unilaterally.",
    items: [
      { icon: "🔒", bg: "rgba(16,185,129,.1)", label: "Funds Locked in Escrow", sub: "Bank-linked · Auditable" },
      { icon: "🏦", bg: "rgba(245,158,11,.1)", label: "Both Sides Confirmed", sub: "Counterparty transfer verified" },
      { icon: "📊", bg: "rgba(26,86,219,.1)", label: "Escrow Receipt Issued", sub: "Timestamped · Immutable record" },
    ],
    pips: [true, true, true, true, false, false],
  },
  {
    tab: "5. Settle",
    num: "05", title: "Instant Settlement",
    desc: "Xspeeria disburses the exchanged currencies directly to each party's designated accounts — instantly. Split to multiple accounts by fixed amount or percentage if needed.",
    items: [
      { icon: "⚡", bg: "rgba(16,185,129,.1)", label: "Funds Disbursed", sub: "Direct to bank account(s)" },
      { icon: "🔀", bg: "rgba(26,86,219,.1)", label: "Split Settlement Available", sub: "Up to 5 beneficiary accounts" },
      { icon: "✅", bg: "rgba(245,158,11,.1)", label: "Transaction Closed", sub: "Full audit trail generated" },
    ],
    pips: [true, true, true, true, true, false],
  },
  {
    tab: "6. Reward",
    num: "06", title: "Rate & Earn Rewards",
    desc: "After each successful exchange, rate your experience. High-quality ratings unlock referral rewards, priority matching, and reduced fees on future transactions.",
    items: [
      { icon: "⭐", bg: "rgba(245,158,11,.1)", label: "Rate Your Peer", sub: "Builds trust score for both parties" },
      { icon: "🎁", bg: "rgba(16,185,129,.1)", label: "Referral Reward Earned", sub: "Invite peers · earn credit" },
      { icon: "📈", bg: "rgba(26,86,219,.1)", label: "Priority Access Unlocked", sub: "Better match rates over time" },
    ],
    pips: [true, true, true, true, true, true],
  },
];

export function HowItWorks() {
  const [current, setCurrent] = useState(0);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrent((c) => (c + 1) % steps.length), 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add("visible"); }),
      { threshold: 0.1 }
    );
    ref.current?.querySelectorAll(".fade-up").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const step = steps[current];

  return (
    <section id="how" ref={ref}>
      <div className="container">
        <div className="section-header fade-up">
          <div className="eyebrow">How It Works</div>
          <h2>Six Steps to Seamless FX</h2>
          <p>From sign-up to settlement, every step is designed for clarity, speed, and zero friction.</p>
        </div>
        <div className="steps-tabs fade-up" role="tablist" aria-label="How it works steps">
          {steps.map((s, i) => (
            <button
              key={s.tab}
              className={`step-tab${i === current ? " active" : ""}`}
              role="tab"
              aria-selected={i === current}
              onClick={() => setCurrent(i)}
            >
              {s.tab}
            </button>
          ))}
        </div>
        <div className="step-panel active" key={current} role="tabpanel">
          <div>
            <div className="step-num">{step.num}</div>
            <div className="step-title">{step.title}</div>
            <p className="step-desc">{step.desc}</p>
            <div className="step-progress">
              {step.pips.map((done, i) => (
                <div key={i} className={`pip${done ? (i === step.pips.lastIndexOf(true) ? " done active-pip" : " done") : ""}`} />
              ))}
            </div>
          </div>
          <div className="step-visual">
            {step.items.map((item) => (
              <div className="sv-item" key={item.label}>
                <div className="sv-icon" style={{ background: item.bg }}>{item.icon}</div>
                <div>
                  <div className="sv-label">{item.label}</div>
                  <div className="sv-sub">{item.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="auto-progress-dots" role="tablist" aria-label="Step navigation dots">
          {steps.map((_, i) => (
            <button
              key={i}
              className={`auto-dot${i === current ? " active" : ""}`}
              onClick={() => setCurrent(i)}
              aria-label={`Step ${i + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
