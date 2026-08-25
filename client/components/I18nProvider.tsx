import { ReactNode, useEffect, useState } from "react";
import { I18nextProvider } from "react-i18next";
import i18n from "@/i18n/config";

interface I18nProviderProps {
  children: ReactNode;
}

export function I18nProvider({ children }: I18nProviderProps) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Force ready state - don't wait for event
    if (i18n.isInitialized) {
      setIsReady(true);
    } else {
      // Set timeout as fallback
      const timeout = setTimeout(() => {
        setIsReady(true);
      }, 2000);

      i18n.on("initialized", () => {
        clearTimeout(timeout);
        setIsReady(true);
      });

      return () => clearTimeout(timeout);
    }
  }, []);

  if (!isReady) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          fontSize: "18px",
        }}
      >
        Loading translations...
      </div>
    );
  }

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
