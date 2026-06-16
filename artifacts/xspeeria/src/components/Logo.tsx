import { useTheme } from "@/context/ThemeContext";

export function Logo() {
  const { isDay } = useTheme();
  return (
    <a href="#hero" className="logo" aria-label="Xspeeria home">
      <div className="logo-lockup">
        <div className="logo-mark">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
        </div>
        <span className={`logo-text${isDay ? "" : ""}`}>Xspeeria<span className="logo-dot">.</span></span>
      </div>
    </a>
  );
}
