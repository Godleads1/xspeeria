import { useEffect, useRef } from "react";

const features = [
  {
    iconClass: "bi-blue",
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="8" cy="8" r="3"/><circle cx="16" cy="16" r="3"/><path d="M10.5 10.5l3 3"/></svg>,
    title: "P2P Matching Engine",
    desc: "Real-time algorithmic matching connects currency buyers and sellers across borders — no intermediary markup, no delay.",
    tag: "Real-Time", tagClass: "bt-blue", wide: false, delay: "0s",
  },
  {
    iconClass: "bi-mint",
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2L4 6v6c0 5.5 3.8 10.7 8 12 4.2-1.3 8-6.5 8-12V6L12 2z"/></svg>,
    title: "Escrow Settlement",
    desc: "Funds lock in bank-linked escrow until both parties clear — giving each exchange tamper-proof, verifiable security.",
    tag: "Zero-Risk", tagClass: "bt-mint", wide: false, delay: ".08s",
  },
  {
    iconClass: "bi-gold",
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z"/></svg>,
    title: "AI Rate Optimization",
    desc: "Smart FX discovery scans live peer offers and routes each exchange to the most favorable mid-market rate automatically.",
    tag: "AI-Driven", tagClass: "bt-blue", wide: false, delay: ".16s",
  },
  {
    iconClass: "bi-mint",
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>,
    title: "Split & Multiple Account Transfers",
    desc: "Disburse exchanged value across one or many destination accounts — split by fixed amounts or custom percentages. Perfect for payroll, business disbursements, and multi-beneficiary settlements in a single transaction.",
    tag: "Flexible", tagClass: "bt-mint", wide: true, delay: ".24s",
  },
  {
    iconClass: "bi-purple",
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20"/></svg>,
    title: "Multi-Currency Debit Card",
    desc: "Optional physical card shipped and activated via user-controlled PIN — carry your exchanged value wherever you go.",
    tag: "Optional", tagClass: "bt-blue", wide: false, delay: ".32s",
  },
  {
    iconClass: "bi-red",
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>,
    title: "Global Compliance First",
    desc: "Full KYC/AML onboarding with country-specific regulatory frameworks — from Canada to Nigeria, UAE to India.",
    tag: "KYC/AML", tagClass: "bt-mint", wide: false, delay: ".40s",
  },
];

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
        <div className="section-header fade-up">
          <div className="eyebrow">Architectural Features</div>
          <h2>Built for Speed.<br />Secured by Design.</h2>
          <p>Every layer of Xspeeria is engineered for trust — from matching to settlement, compliance to delivery.</p>
        </div>
        <div className="bento">
          {features.map((f) => (
            <div key={f.title} className={`bento-card fade-up${f.wide ? " wide" : ""}`} style={{ transitionDelay: f.delay }}>
              <div className={`bento-icon ${f.iconClass}`}>{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
              <span className={`bento-tag ${f.tagClass}`}>{f.tag}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
