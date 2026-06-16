import { useEffect, useState, useRef } from "react";

export function StickyCta() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const hero = document.getElementById("hero");
    const getBottom = () => (hero ? hero.offsetTop + hero.offsetHeight : 0);
    const onScroll = () => {
      if (window.innerWidth < 768) {
        setVisible(window.scrollY > getBottom());
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div id="sticky-cta" className={visible ? "visible" : ""}>
      <a href="#cta-footer" className="btn-primary" style={{ width: "100%", maxWidth: "360px", justifyContent: "center" }}>
        Get Started — It's Free
      </a>
    </div>
  );
}
