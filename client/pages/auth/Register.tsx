import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useLocale } from "@/hooks/useLocale";
import { useTheme } from "@/lib/context/ThemeContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  ArrowRight,
  Mail,
  User,
  Lock,
  CheckCircle2,
  Circle,
} from "lucide-react";
import {
  validatePasswordStrength,
  validateEmail,
} from "@/lib/utils/authSecurityUtils";

export default function Register() {
  const navigate = useNavigate();
  const { register } = useAuth() as any;
  const { t } = useLocale(['auth', 'common']);
  const { theme } = useTheme();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const isDark = theme === "dark";
  const passwordValidation = validatePasswordStrength(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!fullName.trim()) {
      setError("Full name is required");
      return;
    }

    if (fullName.trim().length < 2) {
      setError("Full name must be at least 2 characters");
      return;
    }

    if (!email) {
      setError(t("emailRequired"));
      return;
    }

    if (!validateEmail(email)) {
      setError(t("invalidEmail"));
      return;
    }

    if (!passwordValidation.isValid) {
      setError(
        passwordValidation.errors[0] || "Password does not meet requirements",
      );
      return;
    }

    if (password !== confirmPassword) {
      setError(t("passwordsMismatch"));
      return;
    }

    setIsLoading(true);
    try {
      await register(email, password, fullName);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.internalError"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className={`min-h-screen flex items-center justify-center px-4 py-12 ${isDark ? "bg-black" : "bg-white"}`}
      role="main"
      aria-label={t("register")}
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
          <div
            className={`w-16 h-16 ${isDark ? "bg-white" : "bg-black"} rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg`}
            aria-label="SmartPortal Logo"
          >
            <span
              className={`text-2xl font-bold ${isDark ? "text-black" : "text-white"}`}
            >
              SP
            </span>
          </div>
          <h1
            className={`text-4xl font-bold mb-2 ${isDark ? "text-white" : "text-black"}`}
            id="page-title"
          >
            {t("createNewAccount")}
          </h1>
          <p
            className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}
          >
            Join SmartPortal to manage your deliveries
          </p>
        </div>

        {/* Main Card */}
        <Card
          className={`p-8 backdrop-blur-xl ${isDark ? "bg-gray-900/50 border-gray-800" : "bg-white/80 border-gray-200"} shadow-2xl`}
          role="region"
          aria-labelledby="page-title"
        >
          <form
            onSubmit={handleSubmit}
            className="space-y-6"
            data-testid="register-form"
            noValidate
          >
            {/* Error Message */}
            {error && (
              <div
                className={`flex items-start gap-3 p-4 rounded-lg ${isDark ? "bg-red-500/10 border border-red-500/30" : "bg-red-50 border border-red-200"}`}
                role="alert"
                aria-live="polite"
                aria-atomic="true"
                data-testid="register-error"
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

            {/* Full Name Input */}
            <div className="space-y-2">
              <Label
                htmlFor="fullName"
                className={`text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
              >
                {t("fullName")}
              </Label>
              <div className="relative">
                <User
                  className={`absolute left-3 top-3 h-5 w-5 ${isDark ? "text-gray-600" : "text-gray-400"}`}
                  aria-hidden="true"
                />
                <Input
                  id="fullName"
                  type="text"
                  placeholder="John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={isLoading}
                  data-testid="fullname-input"
                  aria-label={t("fullName")}
                  aria-required="true"
                  aria-describedby={error ? "register-error" : undefined}
                  className={`pl-10 ${isDark ? "bg-gray-800 border-gray-700 text-white placeholder-gray-500" : "bg-gray-50 border-gray-300 text-black placeholder-gray-400"}`}
                  required
                />
              </div>
            </div>

            {/* Email Input */}
            <div className="space-y-2">
              <Label
                htmlFor="email"
                className={`text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
              >
                {t("emailAddress")}
              </Label>
              <div className="relative">
                <Mail
                  className={`absolute left-3 top-3 h-5 w-5 ${isDark ? "text-gray-600" : "text-gray-400"}`}
                  aria-hidden="true"
                />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  data-testid="email-input"
                  aria-label={t("email")}
                  aria-required="true"
                  aria-describedby={error ? "register-error" : undefined}
                  className={`pl-10 ${isDark ? "bg-gray-800 border-gray-700 text-white placeholder-gray-500" : "bg-gray-50 border-gray-300 text-black placeholder-gray-400"}`}
                  required
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-2">
              <Label
                htmlFor="password"
                className={`text-sm font-medium ${isDark ? "text-white" : "text-black"}`}
              >
                {t("password")}
              </Label>
              <div className="relative">
                <Lock
                  className={`absolute left-3 top-3 h-5 w-5 ${isDark ? "text-gray-600" : "text-gray-400"}`}
                  aria-hidden="true"
                />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  data-testid="password-input"
                  aria-label={t("password")}
                  aria-required="true"
                  aria-describedby="password-strength"
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

              {/* Password Strength Indicator */}
              {password && (
                <div
                  className="space-y-2 mt-3"
                  id="password-strength"
                  role="status"
                  aria-live="polite"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-gray-300 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          passwordValidation.strength === "weak"
                            ? "w-1/4"
                            : passwordValidation.strength === "fair"
                              ? "w-2/4"
                              : passwordValidation.strength === "good"
                                ? "w-3/4"
                                : "w-full"
                        } ${isDark ? "bg-gray-600" : "bg-gray-400"}`}
                        aria-valuenow={
                          passwordValidation.strength === "weak"
                            ? 25
                            : passwordValidation.strength === "fair"
                              ? 50
                              : passwordValidation.strength === "good"
                                ? 75
                                : 100
                        }
                        role="progressbar"
                      />
                    </div>
                    <span
                      className={`text-xs font-semibold ${isDark ? "text-gray-300" : "text-gray-700"}`}
                      aria-label={`Password strength: ${passwordValidation.strength}`}
                    >
                      {passwordValidation.strength}
                    </span>
                  </div>

                  {/* Requirements */}
                  <div
                    className={`text-xs space-y-1 ${isDark ? "text-gray-400" : "text-gray-600"}`}
                  >
                    <div className="flex items-center gap-2">
                      {password.length >= 8 ? (
                        <CheckCircle2
                          className={`h-4 w-4 ${isDark ? "text-gray-400" : "text-gray-600"}`}
                          aria-hidden="true"
                        />
                      ) : (
                        <Circle
                          className={`h-4 w-4 ${isDark ? "text-gray-600" : "text-gray-400"}`}
                          aria-hidden="true"
                        />
                      )}
                      <span>At least 8 characters</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {/[A-Z]/.test(password) ? (
                        <CheckCircle2
                          className={`h-4 w-4 ${isDark ? "text-gray-400" : "text-gray-600"}`}
                          aria-hidden="true"
                        />
                      ) : (
                        <Circle
                          className={`h-4 w-4 ${isDark ? "text-gray-600" : "text-gray-400"}`}
                          aria-hidden="true"
                        />
                      )}
                      <span>One uppercase letter</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {/[a-z]/.test(password) ? (
                        <CheckCircle2
                          className={`h-4 w-4 ${isDark ? "text-gray-400" : "text-gray-600"}`}
                          aria-hidden="true"
                        />
                      ) : (
                        <Circle
                          className={`h-4 w-4 ${isDark ? "text-gray-600" : "text-gray-400"}`}
                          aria-hidden="true"
                        />
                      )}
                      <span>One lowercase letter</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {/[0-9]/.test(password) ? (
                        <CheckCircle2
                          className={`h-4 w-4 ${isDark ? "text-gray-400" : "text-gray-600"}`}
                          aria-hidden="true"
                        />
                      ) : (
                        <Circle
                          className={`h-4 w-4 ${isDark ? "text-gray-600" : "text-gray-400"}`}
                          aria-hidden="true"
                        />
                      )}
                      <span>One number</span>
                    </div>
                  </div>
                </div>
              )}
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
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={isLoading}
                  data-testid="confirmPassword-input"
                  aria-label={t("confirmPassword")}
                  aria-required="true"
                  aria-describedby={error ? "register-error" : undefined}
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

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={
                isLoading || !passwordValidation.isValid || !email || !fullName
              }
              data-testid="register-btn"
              aria-busy={isLoading}
              className={`w-full h-11 font-semibold text-base transition-all ${isDark ? "bg-white text-black hover:bg-gray-100" : "bg-black text-white hover:bg-gray-900"}`}
            >
              {isLoading ? (
                <>
                  <Loader2
                    className="h-4 w-4 mr-2 animate-spin"
                    aria-hidden="true"
                  />
                  Creating account...
                </>
              ) : (
                <>
                  {t("register")}
                  <ArrowRight className="h-4 w-4 ml-2" aria-hidden="true" />
                </>
              )}
            </Button>
          </form>
        </Card>

        {/* Footer */}
        <p
          className={`text-center text-sm mt-6 ${isDark ? "text-gray-400" : "text-gray-600"}`}
        >
          {t("haveAccount")}{" "}
          <Link
            to="/login"
            className={`font-semibold hover:underline ${isDark ? "text-white" : "text-black"}`}
            data-testid="signin-link"
          >
            {t("login")}
          </Link>
        </p>
      </div>
    </div>
  );
}
