import { useEffect, useRef } from "react";

export function FeaturesBento() {
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
    <section id="features" className="section-alt" ref={ref}>
      <div className="container">

        {/* ── Header ── */}
        <div className="bento-header fade-up">
          <div>
            <div className="eyebrow">Platform Features</div>
            <h2 style={{ marginBottom: 0 }}>Built for Speed.<br />Secured by Design.</h2>
          </div>
          <p className="bento-header-sub">
            Every layer of Xspeeria is engineered for trust — from matching to settlement, compliance to delivery.
          </p>
        </div>

        {/* ── Grid ── */}
        <div className="bento-v2">

          {/* Col 1: two stacked mini cards */}
          <div className="bento-stack">
            {/* Mini card 1 */}
            <div className="bento-v2-card fade-up" style={{ transitionDelay: "0s" }}>
              <div className="bv2-icon bi-blue">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="8" cy="8" r="3"/><circle cx="16" cy="16" r="3"/><path d="M10.5 10.5l3 3"/>
                </svg>
              </div>
              <div className="bv2-content">
                <span className="bento-tag bt-blue" style={{ marginBottom: 8, display: "inline-block" }}>Real-Time</span>
                <h3>Smart Matching Engine</h3>
                <p>Algorithmic matching connects currency buyers and sellers across borders — no intermediary markup, no delay.</p>
              </div>
            </div>

            {/* Mini card 2 */}
            <div className="bento-v2-card fade-up" style={{ transitionDelay: ".1s" }}>
              <div className="bv2-icon bi-gold">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z"/>
                </svg>
              </div>
              <div className="bv2-content">
                <span className="bento-tag bt-blue" style={{ marginBottom: 8, display: "inline-block" }}>AI-Driven</span>
                <h3>AI Rate Optimization</h3>
                <p>Smart FX discovery scans live member offers and routes each exchange to the most favorable rate automatically.</p>
              </div>
            </div>
          </div>

          {/* Hero card: Bank-Held Settlement */}
          <div className="bento-v2-hero fade-up" style={{ transitionDelay: ".05s" }}>
            <div className="bv2-hero-bg" aria-hidden="true">
              <svg width="220" height="220" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth=".4" strokeLinecap="round" opacity=".12">
                <path d="M12 2L4 6v6c0 5.5 3.8 10.7 8 12 4.2-1.3 8-6.5 8-12V6L12 2z"/>
              </svg>
            </div>
            <div className="bv2-hero-inner">
              <div className="bv2-hero-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 2L4 6v6c0 5.5 3.8 10.7 8 12 4.2-1.3 8-6.5 8-12V6L12 2z"/>
                </svg>
              </div>
              <span className="bento-tag bt-mint" style={{ marginBottom: 16, display: "inline-block" }}>No Custody</span>
              <h3 style={{ fontSize: "1.35rem", lineHeight: 1.3, marginBottom: 14 }}>Bank-Held Settlement</h3>
              <p style={{ fontSize: ".9rem", lineHeight: 1.7, marginBottom: 20 }}>
                Funds are deposited into licensed partner bank accounts until both sides are confirmed. The bank owns and operates the escrow — Xspeeria never takes custody, giving every exchange full institutional-grade security.
              </p>
              <div className="bv2-hero-stats">
                <div className="bv2-stat">
                  <div className="bv2-stat-val">0%</div>
                  <div className="bv2-stat-label">Custody Risk</div>
                </div>
                <div className="bv2-stat-divider" />
                <div className="bv2-stat">
                  <div className="bv2-stat-val">100%</div>
                  <div className="bv2-stat-label">Bank-Settled</div>
                </div>
                <div className="bv2-stat-divider" />
                <div className="bv2-stat">
                  <div className="bv2-stat-val">8</div>
                  <div className="bv2-stat-label">Licensed Partners</div>
                </div>
              </div>
            </div>
          </div>

          {/* Wide card: Split Transfers */}
          <div className="bento-v2-card bento-v2-wide fade-up" style={{ transitionDelay: ".15s" }}>
            <div className="bv2-icon bi-mint">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/>
                <path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/>
              </svg>
            </div>
            <div className="bv2-content">
              <span className="bento-tag bt-mint" style={{ marginBottom: 8, display: "inline-block" }}>Flexible</span>
              <h3>Split & Multiple Account Transfers</h3>
              <p>Receive exchanged value across one or many destination accounts — split by fixed amounts or custom percentages. Perfect for payroll, business disbursements, and multi-beneficiary settlements in a single transaction.</p>
            </div>
          </div>

          {/* Small card: Multi-Currency */}
          <div className="bento-v2-card fade-up" style={{ transitionDelay: ".2s" }}>
            <div className="bv2-icon bi-blue">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20"/>
              </svg>
            </div>
            <div className="bv2-content">
              <span className="bento-tag bt-blue" style={{ marginBottom: 8, display: "inline-block" }}>Optional</span>
              <h3>Multi-Currency Debit Card</h3>
              <p>Optional physical card shipped and activated via user-controlled PIN — carry your exchanged value wherever you go.</p>
            </div>
          </div>

          {/* Full-width card: Compliance */}
          <div className="bento-v2-card bento-v2-full fade-up" style={{ transitionDelay: ".25s" }}>
            <div className="bv2-icon bi-mint">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
              </svg>
            </div>
            <div className="bv2-content">
              <span className="bento-tag bt-mint" style={{ marginBottom: 8, display: "inline-block" }}>KYC / AML</span>
              <h3>Global Compliance First</h3>
              <p>Full KYC/AML onboarding with country-specific regulatory frameworks — from Canada to Nigeria, UAE to India.</p>
            </div>
            <div className="bv2-compliance-pills">
              {["FCA-aligned", "CBN-compliant", "FINTRAC", "CBUAE", "FinCEN", "KYC First", "AML Screened", "AES-256"].map((p) => (
                <span key={p} className="compliance-pill" style={{ fontSize: ".72rem" }}>{p}</span>
              ))}
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
