import { useState, useEffect } from "react";
import { Logo } from "./Logo";
import { useTheme } from "@/context/ThemeContext";

export function Nav({ onVideoOpen }: { onVideoOpen: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { theme, toggleTheme, isDay } = useTheme();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <nav id="nav" className={scrolled ? "scrolled" : ""} role="navigation" aria-label="Main navigation">
        <div className="container">
          <div className="nav-inner">
            <Logo />
            <ul className="nav-links" aria-label="Site sections">
              <li><a href="#why">Why P2P</a></li>
              <li><a href="#features">Features</a></li>
              <li><a href="#how">How It Works</a></li>
              <li><a href="#markets">Markets</a></li>
              <li><a href="#calculator">Calculator</a></li>
            </ul>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">
                {isDay ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
                    </svg>
                    Night
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <circle cx="12" cy="12" r="5"/>
                      <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                    </svg>
                    Day
                  </>
                )}
              </button>
              <a href="#cta-footer" className="btn-launch">Launch App</a>
            </div>
            <button
              className="nav-toggle"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Toggle menu"
              aria-expanded={menuOpen}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6"/>
                <line x1="3" y1="12" x2="21" y2="12"/>
                <line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
        <div className={`mobile-menu${menuOpen ? " open" : ""}`} role="menu">
          <a href="#why" onClick={() => setMenuOpen(false)}>Why P2P</a>
          <a href="#features" onClick={() => setMenuOpen(false)}>Features</a>
          <a href="#how" onClick={() => setMenuOpen(false)}>How It Works</a>
          <a href="#markets" onClick={() => setMenuOpen(false)}>Markets</a>
          <a href="#calculator" onClick={() => setMenuOpen(false)}>Calculator</a>
          <a href="#app-download" onClick={() => setMenuOpen(false)}>Download App</a>
          <button className="theme-toggle" onClick={toggleTheme} style={{ width: "fit-content" }}>
            {isDay ? "🌙 Switch to Night" : "☀️ Switch to Day"}
          </button>
          <a href="#cta-footer" className="btn-primary" style={{ justifyContent: "center" }} onClick={() => setMenuOpen(false)}>Launch App</a>
        </div>
      </nav>
    </>
  );
}
