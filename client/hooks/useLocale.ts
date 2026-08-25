import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { Language } from "@/i18n/config";

export function useLocale(namespace: string | string[] = "common") {
  const { i18n, t, ready } = useTranslation(namespace);

  const changeLanguage = useCallback(
    async (lang: Language) => {
      await i18n.changeLanguage(lang);
      localStorage.setItem("language", lang);
    },
    [i18n],
  );

  // Debug logging
  if (!ready) {
    console.warn('⚠️ i18n not ready yet for namespaces:', namespace);
  }

  return {
    language: i18n.language as Language,
    changeLanguage,
    t,
    ready,
  };
}
