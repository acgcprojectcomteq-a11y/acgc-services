import React, { createContext, useContext, useState } from "react";

const AdminThemeContext = createContext(null);

export function AdminThemeProvider({ children }) {
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window === "undefined") return false;
    const savedTheme = localStorage.getItem("acgc-admin-dark-mode");
    if (savedTheme !== null) return savedTheme === "true";
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  });

  const toggleDarkMode = () => {
    setDarkMode((current) => {
      const next = !current;
      localStorage.setItem("acgc-admin-dark-mode", String(next));
      return next;
    });
  };

  return (
    <AdminThemeContext.Provider value={{ darkMode, toggleDarkMode }}>
      {children}
    </AdminThemeContext.Provider>
  );
}

export function useAdminTheme() {
  const context = useContext(AdminThemeContext);
  if (!context) {
    throw new Error("useAdminTheme must be used within AdminThemeProvider");
  }
  return context;
}
