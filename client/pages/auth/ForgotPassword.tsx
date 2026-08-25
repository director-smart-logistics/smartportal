import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTheme } from "@/lib/context/ThemeContext";
import { useSettings } from "@/lib/context/SettingsContext";
import { useLocale } from "@/hooks/useLocale";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  AlertCircle,
  Loader2,
  Mail,
  ArrowLeft,
  CheckCircle,
} from "lucide-react";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { settings } = useSettings();
  const { t } = useLocale(['auth', 'common']);

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const isDark = theme === "dark";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    // Basic validation
    if (!email) {
      setError(t("emailRequired"));
      setIsLoading(false);
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError(t("invalidEmail"));
      setIsLoading(false);
      return;
    }

    try {
      // Simulate sending reset email
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setSubmitted(true);
    } catch (err) {
      setError("Failed to send reset email. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className={`min-h-screen flex items-center justify-center ${isDark ? "bg-gray-950" : "bg-gray-50"}`}
      role="main"
      aria-label={t("forgotPassword")}
    >
      <div className="w-full max-w-6xl flex items-center justify-center gap-8 px-4 py-12">
        {/* Left Side - Forgot Password Form */}
        <div className="w-full max-w-md relative z-10">
        {/* Header */}
        <div className="text-center mb-8">
          <h1
            className={`text-3xl font-bold mb-2 ${isDark ? "text-white" : "text-gray-900"}`}
            id="page-title"
          >
            {t("resetPassword")}
          </h1>
          <p
            className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}
          >
            {t("pleaseCheckEmail")}
          </p>
        </div>

        {/* Form */}
        <div
          role="region"
          aria-labelledby="page-title"
        >
          {!submitted ? (
            <form
              onSubmit={handleSubmit}
              className="space-y-6"
              data-testid="forgot-password-form"
              noValidate
            >
              {/* Error Message */}
              {error && (
                <div
                  className={`flex items-start gap-3 p-4 rounded-lg ${isDark ? "bg-red-500/10 border border-red-500/30" : "bg-red-50 border border-red-200"}`}
                  role="alert"
                  aria-live="polite"
                  aria-atomic="true"
                  data-testid="forgot-password-error"
                >
                  <AlertCircle
                    className={`h-5 w-5 flex-shrink-0 mt-0.5 ${isDark ? "text-red-400" : "text-red-600"}`}
                    aria-hidden="true"
                  />
                  <p
                    className={`text-sm ${isDark ? "text-red-300" : "text-red-700"}`}
                  >
                    {error}
                  </p>
                </div>
              )}

              {/* Email Input */}
              <div className="space-y-2">
                <div className="relative">
                  <Mail
                    className={`absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 ${isDark ? "text-gray-500" : "text-gray-400"}`}
                    aria-hidden="true"
                  />
                  <Input
                    id="email"
                    type="email"
                    placeholder={t("emailAddress")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    data-testid="email-input"
                    aria-label={t("email")}
                    aria-required="true"
                    aria-describedby={
                      error ? "forgot-password-error" : undefined
                    }
                    className={`pl-12 h-12 rounded-xl ${isDark ? "bg-gray-800 border-gray-700 text-white placeholder-gray-500" : "bg-white border-gray-300 text-gray-900 placeholder-gray-400"}`}
                    required
                  />
                </div>
              </div>

              {/* Info */}
              <p
                className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}
              >
                {t("resetPasswordInfo")}
              </p>

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={isLoading}
                data-testid="send-reset-link-btn"
                aria-busy={isLoading}
                className={`w-full h-12 rounded-xl font-semibold text-base ${isDark ? "bg-white text-black hover:bg-gray-100" : "bg-black text-white hover:bg-gray-800"}`}
              >
                {isLoading ? (
                  <>
                    <Loader2
                      className="h-5 w-5 mr-2 animate-spin"
                      aria-hidden="true"
                    />
                    {t("signingIn")}
                  </>
                ) : (
                  t("sendResetLink")
                )}
              </Button>

              {/* Back to Login */}
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/login")}
                data-testid="back-to-login-btn"
                className={`w-full h-12 rounded-xl font-semibold ${isDark ? "border-gray-700 text-white hover:bg-gray-800" : "border-gray-300 text-black hover:bg-gray-50"}`}
              >
                <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
                {t("backToLogin")}
              </Button>
            </form>
          ) : (
            <div className="space-y-6">
              {/* Success Message */}
              <div className="text-center">
                <div
                  className={`w-16 h-16 ${isDark ? "bg-green-500/20 border border-green-500/30" : "bg-green-50 border border-green-200"} rounded-full flex items-center justify-center mx-auto mb-4`}
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                  data-testid="success-status"
                >
                  <CheckCircle
                    className={`h-8 w-8 ${isDark ? "text-green-400" : "text-green-600"}`}
                    aria-hidden="true"
                  />
                </div>
                <h2
                  className={`text-2xl font-bold mb-2 ${isDark ? "text-white" : "text-black"}`}
                  data-testid="success-message"
                >
                  Check Your Email
                </h2>
                <p
                  className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}
                >
                  We've sent a password reset link to <br />
                  <span className="font-semibold">{email}</span>
                </p>
              </div>

              {/* Info */}
              <div
                className={`p-4 rounded-lg ${isDark ? "bg-gray-800/50 border border-gray-700" : "bg-gray-50 border border-gray-200"}`}
                role="note"
              >
                <p
                  className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}
                >
                  The link will expire in 24 hours. If you don't receive an
                  email, check your spam folder or try again.
                </p>
              </div>

              {/* Back to Login */}
              <Button
                onClick={() => navigate("/login")}
                data-testid="back-to-login-success-btn"
                className={`w-full h-12 rounded-xl font-semibold text-base ${isDark ? "bg-white text-black hover:bg-gray-100" : "bg-black text-white hover:bg-gray-800"}`}
              >
                {t("backToLogin")}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Right Side - Illustration Panel */}
      <div className={`hidden lg:flex w-full max-w-lg h-[600px] rounded-3xl ${isDark ? "bg-gray-900" : "bg-gradient-to-br from-gray-900 to-black"} p-8 flex-col justify-between relative overflow-hidden`}>
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-0 w-full h-full">
            <div className="absolute top-10 left-10 w-32 h-32 bg-white rounded-full blur-3xl"></div>
            <div className="absolute bottom-20 right-10 w-40 h-40 bg-blue-500 rounded-full blur-3xl"></div>
          </div>
        </div>

        {/* Content */}
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-8">
            <div className="p-2 bg-white/10 rounded-lg backdrop-blur-sm">
              <Logo size="sm" showText={false} className="text-white" />
            </div>
            <span className="text-white font-semibold">SmartLogistics</span>
          </div>

          {/* Feature List */}
          <div className="space-y-6">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-white/10 rounded-lg backdrop-blur-sm mt-1">
                <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-white font-semibold mb-1">{t("auth.features.realTimeTracking.title")}</h3>
                <p className="text-gray-400 text-sm">{t("auth.features.realTimeTracking.description")}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 bg-white/10 rounded-lg backdrop-blur-sm mt-1">
                <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <h3 className="text-white font-semibold mb-1">{t("auth.features.fastDelivery.title")}</h3>
                <p className="text-gray-400 text-sm">{t("auth.features.fastDelivery.description")}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 bg-white/10 rounded-lg backdrop-blur-sm mt-1">
                <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div>
                <h3 className="text-white font-semibold mb-1">{t("auth.features.securePlatform.title")}</h3>
                <p className="text-gray-400 text-sm">{t("auth.features.securePlatform.description")}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Text */}
        <div className="relative z-10">
          <h2 className="text-2xl font-bold text-white mb-2">{t("auth.features.optimizeProcesses.title")}</h2>
          <p className="text-gray-400 text-sm">{t("auth.features.optimizeProcesses.description")}</p>
        </div>
      </div>
    </div>

    {/* Footer - Centered at bottom */}
    <div className="absolute bottom-8 left-0 right-0">
      <p className={`text-xs text-center ${isDark ? "text-gray-600" : "text-gray-500"}`}>
        © 2025 SmartLogistics. All rights reserved.
      </p>
    </div>
    </div>
  );
}
