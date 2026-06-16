import { useEffect, useRef } from "react";

const testimonials = [
  {
    stars: 5,
    quote: '"I send money home to Lagos every month. With Xspeeria I got 31% more naira than my bank was giving me. That\'s real money — school fees covered."',
    avatar: "👨🏾",
    name: "Chukwuemeka A.",
    country: "🇨🇦 Toronto, Canada",
  },
  {
    stars: 5,
    quote: '"As a freelancer getting paid in USD, I was losing thousands every year to wallet fees. Xspeeria\'s escrow made me trust the process immediately. Never going back."',
    avatar: "👩🏽",
    name: "Aisha M.",
    country: "🇳🇬 Lagos, Nigeria",
  },
  {
    stars: 5,
    quote: '"We pay our Nairobi suppliers monthly. Xspeeria\'s split transfer feature let us pay 4 vendors in one go. Saved us 2 hours of banking every cycle."',
    avatar: "👨🏿",
    name: "David K.",
    country: "🇬🇧 London, UK",
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
          <div className="eyebrow">What People Say</div>
          <h2>Trusted by People<br />Who Move Money</h2>
        </div>
        <div className="testi-grid fade-up" aria-label="Customer testimonials">
          {testimonials.map((t) => (
            <div className="testi-card" key={t.name}>
              <div className="stars">{"★".repeat(t.stars)}</div>
              <p className="testi-quote">{t.quote}</p>
              <div className="testi-user">
                <div className="testi-avatar">{t.avatar}</div>
                <div>
                  <div className="testi-name">{t.name}</div>
                  <div className="testi-country">{t.country}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
