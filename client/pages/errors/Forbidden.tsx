import { useNavigate } from "react-router-dom";
import { useTheme } from "@/lib/context/ThemeContext";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Home, ArrowLeft } from "lucide-react";

export default function Forbidden() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div
      className={`min-h-screen flex items-center justify-center px-4 py-12 ${isDark ? "bg-black" : "bg-white"}`}
    >
      {/* Background grid effect */}
      <div
        className={`absolute inset-0 ${isDark ? "bg-grid-white/10" : "bg-grid-black/5"}`}
        style={{
          backgroundImage: `linear-gradient(0deg, ${isDark ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.03)"} 1px, transparent 1px), linear-gradient(90deg, ${isDark ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.03)"} 1px, transparent 1px)`,
          backgroundSize: "50px 50px",
        }}
      />

      <div className="w-full max-w-md text-center relative z-10">
        {/* Error Icon */}
        <div
          className={`w-20 h-20 ${isDark ? "bg-gray-800/50 border border-gray-700" : "bg-gray-100 border border-gray-300"} rounded-2xl flex items-center justify-center mx-auto mb-6`}
        >
          <AlertTriangle
            className={`h-10 w-10 ${isDark ? "text-gray-400" : "text-gray-600"}`}
          />
        </div>

        {/* Error Code */}
        <div className="mb-4">
          <h1
            className={`text-6xl font-bold mb-2 ${isDark ? "text-white" : "text-black"}`}
          >
            403
          </h1>
          <p
            className={`text-xl font-semibold ${isDark ? "text-gray-300" : "text-gray-800"}`}
          >
            Access Forbidden
          </p>
        </div>

        {/* Description */}
        <p
          className={`text-sm mb-8 ${isDark ? "text-gray-400" : "text-gray-600"}`}
        >
          You don't have permission to access this resource. If you believe this
          is a mistake, contact your administrator.
        </p>

        {/* Action Buttons */}
        <div className="flex gap-3 justify-center">
          <Button
            onClick={() => navigate(-1)}
            variant="outline"
            className={`flex items-center gap-2 ${isDark ? "border-gray-700 text-white hover:bg-gray-800" : "border-gray-300 text-black hover:bg-gray-50"}`}
          >
            <ArrowLeft className="h-4 w-4" />
            Go Back
          </Button>
          <Button
            onClick={() => navigate("/dashboard")}
            className={`flex items-center gap-2 ${isDark ? "bg-white text-black hover:bg-gray-100" : "bg-black text-white hover:bg-gray-900"}`}
          >
            <Home className="h-4 w-4" />
            Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
