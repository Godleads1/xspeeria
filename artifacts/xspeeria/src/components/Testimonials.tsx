import { useEffect, useRef } from "react";

const anticipations = [
  {
    avatar: "👨🏾",
    name: "Chukwuemeka A.",
    location: "🇨🇦 Toronto, Canada",
    quote: '"I send money home to Lagos every month and lose a fortune to bank margins. I\'ve joined the waitlist — can\'t wait to finally get a fair rate."',
  },
  {
    avatar: "👩🏽",
    name: "Aisha M.",
    location: "🇳🇬 Lagos, Nigeria",
    quote: '"As a freelancer paid in USD, I lose thousands yearly to wallet fees. Xspeeria looks like exactly what I\'ve been waiting for."',
  },
  {
    avatar: "👨🏿",
    name: "David K.",
    location: "🇬🇧 London, UK",
    quote: '"We pay Nairobi suppliers monthly and the FX markup is painful. I signed up for early access the moment I saw the P2P model."',
  },
];

export function Testimonials() {
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
    <section id="testimonials" ref={ref}>
      <div className="container">
        <div className="section-header fade-up">
          <div className="eyebrow">Early Access</div>
          <h2>People Are Already<br />Waiting for Xspeeria</h2>
          <p style={{ maxWidth: 520, margin: "0 auto" }}>
            Our app is launching soon. Here's what people on our waitlist are saying about why they signed up.
          </p>
        </div>

        <div className="testi-grid" aria-label="Waitlist member anticipations">
          {anticipations.map((t, i) => (
            <div className="testi-card fade-up" key={t.name} style={{ transitionDelay: `${i * 0.12}s` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <span style={{
                  fontSize: ".65rem", fontWeight: 800, letterSpacing: ".08em",
                  textTransform: "uppercase", background: "rgba(16,185,129,.12)",
                  color: "var(--mint)", padding: "3px 10px", borderRadius: 999
                }}>
                  Waitlist Member
                </span>
              </div>
              <p className="testi-quote">{t.quote}</p>
              <div className="testi-user">
                <div className="testi-avatar">{t.avatar}</div>
                <div>
                  <div className="testi-name">{t.name}</div>
                  <div className="testi-country">{t.location}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="fade-up" style={{ textAlign: "center", marginTop: 40 }}>
          <p style={{ fontSize: ".9rem", color: "var(--text-dim)", marginBottom: 16 }}>
            🚀 App launching soon — secure your spot now
          </p>
          <a href="#cta-footer" className="btn-primary" style={{ display: "inline-flex" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
            Join the Waitlist
          </a>
        </div>
      </div>
    </section>
  );
}
