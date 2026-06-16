import { useTheme } from "@/context/ThemeContext";

export function Logo() {
  const { isDay } = useTheme();
  return (
    <a href="#hero" className="logo" aria-label="Xspeeria home">
      {isDay ? (
        <div className="logo-lockup">
          <div className="logo-mark logo-mark-day">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1a56db" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/>
              <path d="M2 17l10 5 10-5"/>
              <path d="M2 12l10 5 10-5"/>
            </svg>
          </div>
          <span className="logo-text logo-text-day">Xspeeria<span className="logo-dot-day">.</span></span>
        </div>
      ) : (
        <div className="logo-lockup">
          <div className="logo-mark logo-mark-night">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/>
              <path d="M2 17l10 5 10-5"/>
              <path d="M2 12l10 5 10-5"/>
            </svg>
          </div>
          <span className="logo-text logo-text-night">Xspeeria<span className="logo-dot-night">.</span></span>
        </div>
      )}
    </a>
  );
}
