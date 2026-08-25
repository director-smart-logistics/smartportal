import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTheme } from "@/lib/context/ThemeContext";
import { useSettings } from "@/lib/context/SettingsContext";
import { useLocale } from "@/hooks/useLocale";
import { Logo } from "@/components/ui/logo";
import { GlowButton } from "@/components/ui/glow-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  AlertCircle,
  Loader2,
  Lock,
  Eye,
  EyeOff,
  CheckCircle,
} from "lucide-react";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { theme } = useTheme();
  const { settings } = useSettings();
  const { t } = useLocale(['auth', 'common']);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const isDark = theme === "dark";
  const token = searchParams.get("token");

  const validatePassword = (pwd: string): string | null => {
    if (pwd.length < 8) {
      return "Password must be at least 8 characters long";
    }
    if (!/[A-Z]/.test(pwd)) {
      return "Password must contain at least one uppercase letter";
    }
    if (!/[a-z]/.test(pwd)) {
      return "Password must contain at least one lowercase letter";
    }
    if (!/[0-9]/.test(pwd)) {
      return "Password must contain at least one number";
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    // Validation
    if (!password || !confirmPassword) {
      setError(t("fillAllFields"));
      setIsLoading(false);
      return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      setIsLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError(t("passwordsMismatch"));
      setIsLoading(false);
      return;
    }

    if (!token) {
      setError("Invalid reset link. Please try again.");
      setIsLoading(false);
      return;
    }

    try {
      // Simulate resetting password
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setSuccess(true);
      setTimeout(() => navigate("/login"), 3000);
    } catch (err) {
      setError("Failed to reset password. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className={`min-h-screen flex items-center justify-center px-4 py-12 ${isDark ? "bg-black" : "bg-white"}`}
      role="main"
      aria-label={t("resetPassword")}
    >
      {/* Background grid effect */}
      <div
        className={`absolute inset-0 ${isDark ? "bg-grid-white/10" : "bg-grid-black/5"}`}
        style={{
          backgroundImage: `linear-gradient(0deg, ${isDark ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.03)"} 1px, transparent 1px), linear-gradient(90deg, ${isDark ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.03)"} 1px, transparent 1px)`,
          backgroundSize: "50px 50px",
        }}
        aria-hidden="true"
      />

      <div className="w-full max-w-md relative z-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-6">
            <Logo size="lg" showText={false} />
          </div>
          <h1
            className={`text-2xl font-semibold mb-2 ${isDark ? "text-white" : "text-black"}`}
            id="page-title"
          >
            {t("resetPassword")}
          </h1>
          <p
            className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}
          >
            Enter a strong password to secure your account
          </p>
        </div>

        {/* Main Card */}
        <Card
          className={`p-8 backdrop-blur-xl ${isDark ? "bg-gray-900/50 border-gray-800" : "bg-white/80 border-gray-200"} shadow-2xl`}
          role="region"
          aria-labelledby="page-title"
        >
          {!success ? (
            <form
              onSubmit={handleSubmit}
              className="space-y-6"
              data-testid="reset-password-form"
              noValidate
            >
              {/* Error Message */}
              {error && (
                <div
                  className={`flex items-start gap-3 p-4 rounded-lg ${isDark ? "bg-red-500/10 border border-red-500/30" : "bg-red-50 border border-red-200"}`}
                  role="alert"
                  aria-live="polite"
                  aria-atomic="true"
                  data-testid="reset-password-error"
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

              {/* Password Input */}
              <div className="space-y-2">
                <Label
                  htmlFor="password"
                  className={`text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
                >
                  {t("enterNewPassword")}
                </Label>
                <div className="relative">
                  <Lock
                    className={`absolute left-3 top-3 h-5 w-5 ${isDark ? "text-gray-600" : "text-gray-400"}`}
                    aria-hidden="true"
                  />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Min 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    data-testid="password-input"
                    aria-label={t("password")}
                    aria-required="true"
                    aria-describedby={
                      error ? "reset-password-error" : undefined
                    }
                    className={`pl-10 pr-10 ${isDark ? "bg-gray-800 border-gray-700 text-white placeholder-gray-500" : "bg-gray-50 border-gray-300 text-black placeholder-gray-400"}`}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className={`absolute right-3 top-3 ${isDark ? "text-gray-600 hover:text-gray-400" : "text-gray-400 hover:text-gray-600"}`}
                    disabled={isLoading}
                    aria-label={
                      showPassword
                        ? t("hidePassword")
                        : t("showPassword")
                    }
                    aria-pressed={showPassword}
                    data-testid="password-toggle"
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Confirm Password Input */}
              <div className="space-y-2">
                <Label
                  htmlFor="confirmPassword"
                  className={`text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
                >
                  {t("confirmPassword")}
                </Label>
                <div className="relative">
                  <Lock
                    className={`absolute left-3 top-3 h-5 w-5 ${isDark ? "text-gray-600" : "text-gray-400"}`}
                    aria-hidden="true"
                  />
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Re-enter password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={isLoading}
                    data-testid="confirmPassword-input"
                    aria-label={t("confirmPassword")}
                    aria-required="true"
                    aria-describedby={
                      error ? "reset-password-error" : undefined
                    }
                    className={`pl-10 pr-10 ${isDark ? "bg-gray-800 border-gray-700 text-white placeholder-gray-500" : "bg-gray-50 border-gray-300 text-black placeholder-gray-400"}`}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className={`absolute right-3 top-3 ${isDark ? "text-gray-600 hover:text-gray-400" : "text-gray-400 hover:text-gray-600"}`}
                    disabled={isLoading}
                    aria-label={
                      showConfirmPassword
                        ? t("hidePassword")
                        : t("showPassword")
                    }
                    aria-pressed={showConfirmPassword}
                    data-testid="confirmPassword-toggle"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Password Requirements */}
              <div
                className={`p-4 rounded-lg ${isDark ? "bg-gray-800/50 border border-gray-700" : "bg-gray-50 border border-gray-200"}`}
                role="region"
                aria-labelledby="password-requirements"
              >
                <p
                  id="password-requirements"
                  className={`text-xs font-semibold mb-2 ${isDark ? "text-gray-300" : "text-gray-700"}`}
                >
                  Password Requirements:
                </p>
                <ul
                  className={`text-xs space-y-1 ${isDark ? "text-gray-400" : "text-gray-600"}`}
                >
                  <li>✓ At least 8 characters</li>
                  <li>✓ One uppercase letter (A-Z)</li>
                  <li>✓ One lowercase letter (a-z)</li>
                  <li>✓ One number (0-9)</li>
                </ul>
              </div>

              {/* Submit Button */}
              <GlowButton
                type="submit"
                disabled={isLoading}
                isLoading={isLoading}
                loadingText="Resetting..."
                variant={isDark ? "light" : "dark"}
                data-testid="reset-password-btn"
                aria-busy={isLoading}
              >
                {t("resetPassword")}
              </GlowButton>
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
                  {t("passwordReset")}
                </h2>
                <p
                  className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}
                >
                  {t("passwordResetSuccess")} <br />
                  Redirecting to login...
                </p>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
