import { createContext, useContext, useState, useEffect, ReactNode } from "react";

type Theme = "day" | "night";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  isDay: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "day",
  toggleTheme: () => {},
  isDay: true,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("day");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "day" ? "night" : "day"));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, isDay: theme === "day" }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
