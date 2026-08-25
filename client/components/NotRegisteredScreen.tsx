import { ShieldAlert, ArrowLeft, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/firebase";
import { useTheme } from "@/lib/context/ThemeContext";

/**
 * 403 Not Registered Error Screen
 * Shown when a user tries to sign in with Google but is not invited (no pending_registration)
 */
export function NotRegisteredScreen() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const handleGoBack = async () => {
    await signOut().catch(() => {});
    window.location.href = "/login";
  };

  return (
    <div
      className={`min-h-screen flex items-center justify-center px-4 py-12 ${isDark ? "bg-black" : "bg-white"}`}
    >
      {/* Background grid effect — matches NotFound */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `linear-gradient(0deg, ${isDark ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.03)"} 1px, transparent 1px), linear-gradient(90deg, ${isDark ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.03)"} 1px, transparent 1px)`,
          backgroundSize: "50px 50px",
        }}
      />

      <div className="w-full max-w-md text-center relative z-10">
        {/* Icon */}
        <div
          className={`w-20 h-20 ${isDark ? "bg-gray-800/50 border border-gray-700" : "bg-gray-100 border border-gray-300"} rounded-2xl flex items-center justify-center mx-auto mb-6`}
        >
          <ShieldAlert
            className={`h-10 w-10 ${isDark ? "text-gray-400" : "text-gray-600"}`}
          />
        </div>

        {/* Error code + title */}
        <div className="mb-4">
          <h1
            className={`text-6xl font-bold mb-2 ${isDark ? "text-white" : "text-black"}`}
          >
            403
          </h1>
          <p
            className={`text-xl font-semibold ${isDark ? "text-gray-300" : "text-gray-800"}`}
          >
            Acceso Denegado
          </p>
        </div>

        {/* Description */}
        <p
          className={`text-sm mb-6 ${isDark ? "text-gray-400" : "text-gray-600"}`}
        >
          Tu correo no está registrado en el sistema. Para acceder al portal,
          debes ser invitado previamente por un administrador.
        </p>

        {/* Contact hint */}
        <div
          className={`flex items-center justify-center gap-2 text-sm mb-8 ${isDark ? "text-gray-500" : "text-gray-500"}`}
        >
          <Mail className="h-4 w-4" />
          <span>Contacta al administrador para solicitar acceso</span>
        </div>

        {/* Action button */}
        <div className="flex justify-center">
          <Button
            onClick={handleGoBack}
            variant="outline"
            className={`flex items-center gap-2 ${isDark ? "border-gray-700 text-white hover:bg-gray-800" : "border-gray-300 text-black hover:bg-gray-50"}`}
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al inicio de sesión
          </Button>
        </div>
      </div>
    </div>
  );
}
