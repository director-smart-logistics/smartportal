import { useAuth } from "@/hooks/useAuth";
import { useLocale } from "@/hooks/useLocale";

import { Button } from "@/components/ui/button";
import { LogOut, Globe } from "lucide-react";
import { Link } from "react-router-dom";
import type { Language } from "@/i18n/config";
import { AppBreadcrumb } from "./AppBreadcrumb";
import { GlobalSearch } from "./GlobalSearch";

export function Header() {
  const { user, logout } = useAuth();
  const { language, changeLanguage, t } = useLocale(["menu", "common"]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const handleLanguageChange = () => {
    const newLang: Language = language === "en" ? "es" : "en";
    changeLanguage(newLang);
  };

  return (
    <header
      className="hidden md:block border-b bg-background sticky top-0 z-40"
      data-testid="header"
      role="banner"
      aria-label="Application header"
    >
      <div className="flex items-center gap-4 h-16 px-6">
        {/* Left: Breadcrumbs */}
        <div className="flex items-center min-w-0 flex-1">
          <AppBreadcrumb />
        </div>

        {/* Center: Global Search - Desktop Only */}
        <div className="flex items-center justify-center flex-shrink-0 w-full max-w-md">
          <GlobalSearch />
        </div>

        {/* Right: Language & User Controls */}
        <nav
          className="flex items-center gap-2 flex-shrink-0 ml-auto"
          aria-label="Header controls"
        >
          <button
            onClick={handleLanguageChange}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label={`${t("menu.language")}: ${language.toUpperCase()}`}
            data-testid="language-toggle"
            title={
              language === "en" ? "Cambiar a Español" : "Switch to English"
            }
          >
            <Globe className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{language.toUpperCase()}</span>
          </button>

          {user && (
            <div className="flex items-center gap-4 pl-4 border-l">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-foreground">
                  {user.fullName}
                </p>
                <p
                  className="text-xs text-muted-foreground"
                  aria-label={`Role: ${user.role}`}
                >
                  {user.role}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                data-testid="logout-btn"
                aria-label="Log out"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
