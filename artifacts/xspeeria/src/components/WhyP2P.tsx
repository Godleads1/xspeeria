import { useEffect, useRef } from "react";

export function WhyP2P() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add("visible"); }),
      { threshold: 0.1 }
    );
    ref.current?.querySelectorAll(".fade-up").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const cards = [
    {
      badge: "For Families", badgeClass: "why-badge-family",
      img: "https://images.unsplash.com/photo-1609220136736-443140cffec6?w=600&q=80&auto=format",
      imgAlt: "Family receiving remittance",
      title: "Send More Home",
      desc: "Skip the bank FX desk markup. Remittances are matched to verified members and settled through licensed banking rails at mid-market rates. Every naira matters.",
      savings: "💰 Save on every transfer home",
      delay: "0s",
    },
    {
      badge: "For Travelers", badgeClass: "why-badge-travel",
      img: "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=600&q=80&auto=format",
      imgAlt: "Traveler with phone",
      title: "Swap at Local Rates",
      desc: "Swap cash with verified members in-country. Arrive with the rate locals get — not the tourist markup.",
      savings: "✈️ Swap cash at local rates",
      delay: ".1s",
    },
    {
      badge: "For Business", badgeClass: "why-badge-biz",
      img: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=600&q=80&auto=format",
      imgAlt: "Business owner",
      title: "Pay Suppliers Directly",
      desc: "Settle invoices in your supplier's currency. Matched Verified members transactions flow through licensed local banks — no correspondent bank FX markup, no hidden margins.",
      savings: "🏭 Pay suppliers in their currency",
      delay: ".2s",
    },
  ];

  return (
    <section id="why" ref={ref}>
      <div className="container">
        <div className="section-header fade-up">
          <div className="eyebrow"></div>
          <h2>The Direct FX Exchange Network<br />Built for Africa & Beyond</h2>
          <p>Xspeeria is a regulated technology Exchange Network that connects buyers and sellers of foreign currency directly — with all settlements flowing through licensed partner banks. No custody. No hidden margins. Just the rate you negotiate.</p>
        </div>
        <div className="why-grid">
          {cards.map((card) => (
            <div className="why-card fade-up" key={card.title} style={{ transitionDelay: card.delay }}>
              <div className="why-img">
                <img className="why-img-inner" src={card.img} alt={card.imgAlt} loading="lazy" />
                <div className="why-img-overlay" aria-hidden="true" />
              </div>
              <div className="why-body">
                <div className={`why-badge ${card.badgeClass}`}>{card.badge}</div>
                <h3>{card.title}</h3>
                <p>{card.desc}</p>
                <div className="why-savings">{card.savings}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
