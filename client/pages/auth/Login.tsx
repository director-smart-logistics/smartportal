import { useState, useEffect } from "react";
import { useFirebaseAuth } from "@/lib/context/FirebaseAuthContext";
import { useLocale } from "@/hooks/useLocale";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  Loader2,
} from "lucide-react";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

let hasRedirected = false;

export default function Login() {
  const { loginWithGoogle, isAuthenticated, user, isLoading: authLoading, error: authError, clearError } = useFirebaseAuth();
  const { t } = useLocale(['auth', 'common']);

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated && user && !hasRedirected) {
      hasRedirected = true;
      const redirectPath = user.role === "DELIVERY" ? "/routes/sessions" : "/dashboard";
      window.location.href = redirectPath;
    }
  }, [isAuthenticated, user]);

  useEffect(() => {
    if (authError) {
      setError(authError);
    }
  }, [authError]);

  const handleGoogleSignIn = async () => {
    if (isLoading || authLoading) return;
    
    setError(null);
    clearError();
    setIsLoading(true);

    try {
      await loginWithGoogle();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t("errors.internalError");
      if (errorMessage.includes("popup-closed-by-user")) {
        setError(t("errors.popupClosed"));
      } else if (errorMessage.includes("unauthorized-domain")) {
        setError(t("errors.unauthorizedDomain"));
      } else {
        setError(errorMessage);
      }
      setIsLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-950 dark:to-gray-900"
      role="main"
      aria-label={t("login")}
    >
      {/* Single Centered Card */}
      <div className="w-full max-w-lg mx-4 rounded-3xl bg-gradient-to-br from-gray-900 to-black p-8 md:p-10 relative overflow-hidden shadow-2xl">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div className="absolute top-10 left-10 w-32 h-32 bg-white rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 right-10 w-40 h-40 bg-blue-500 rounded-full blur-3xl"></div>
        </div>

        {/* Content */}
        <div className="relative z-10">
          {/* Logo Header */}
          <div className="flex items-center justify-center gap-2 mb-8">
            <div className="p-2 bg-white/10 rounded-lg backdrop-blur-sm">
              <Logo size="sm" showText={false} className="text-white" />
            </div>
            <span className="text-white font-semibold text-xl">SmartLogistics</span>
          </div>

          {/* Welcome Text */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white mb-2" id="page-title">
              {t("welcomeBack")}
            </h1>
            <p className="text-gray-400 text-sm">
              {t("loginSubtitle")}
            </p>
          </div>

          {/* Login Form Section */}
          <div role="region" aria-labelledby="page-title" className="space-y-6">
            {/* Error Message */}
            {error && (
              <div
                className="flex items-start gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/30"
                role="alert"
                aria-live="polite"
                aria-atomic="true"
                data-testid="login-error"
              >
                <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5 text-red-400" aria-hidden="true" />
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            {/* Google Sign-In Button */}
            <Button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isLoading || authLoading}
              data-testid="google-login-btn"
              aria-busy={isLoading || authLoading}
              className="w-full h-14 rounded-xl font-semibold text-base flex items-center justify-center gap-3 transition-all bg-white text-gray-900 hover:bg-gray-100 border border-gray-200"
            >
              {isLoading || authLoading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>{t("signingIn")}</span>
                </>
              ) : (
                <>
                  <GoogleIcon className="h-5 w-5" />
                  <span>{t("continueWithGoogle")}</span>
                </>
              )}
            </Button>

            {/* Info Message */}
            <div className="text-center p-4 rounded-lg bg-white/5 border border-white/10">
              <p className="text-sm text-gray-300">
                {t("internalAccountsOnly")}
              </p>
              <p className="text-xs mt-1 text-gray-500">
                {t("contactAdminForAccess")}
              </p>
            </div>
          </div>

          {/* Feature List */}
          <div className="mt-10 pt-8 border-t border-white/10 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-white/10 rounded-lg backdrop-blur-sm mt-0.5">
                <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-white font-medium text-sm">{t("features_realTimeTracking_title")}</h3>
                <p className="text-gray-500 text-xs">{t("features_realTimeTracking_description")}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 bg-white/10 rounded-lg backdrop-blur-sm mt-0.5">
                <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <h3 className="text-white font-medium text-sm">{t("features_fastDelivery_title")}</h3>
                <p className="text-gray-500 text-xs">{t("features_fastDelivery_description")}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 bg-white/10 rounded-lg backdrop-blur-sm mt-0.5">
                <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div>
                <h3 className="text-white font-medium text-sm">{t("features_securePlatform_title")}</h3>
                <p className="text-gray-500 text-xs">{t("features_securePlatform_description")}</p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 text-center">
            <p className="text-xs text-gray-600">
              © 2025 SmartLogistics. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
