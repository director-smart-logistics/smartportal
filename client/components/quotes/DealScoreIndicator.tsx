import React from "react";
import { motion } from "framer-motion";
import { useTheme } from "@/lib/context/ThemeContext";
import { useLocale } from "@/hooks/useLocale";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface DealScoreIndicatorProps {
  score: number;
  category?: "very_likely" | "likely" | "uncertain" | "unlikely";
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

export const DealScoreIndicator = React.memo(function DealScoreIndicator({
  score,
  category,
  size = "md",
  showLabel = true,
  className = "",
}: DealScoreIndicatorProps) {
  const { theme } = useTheme();
  const { t } = useLocale(["quotes"]);
  const isDark = theme === "dark";

  const getColor = () => {
    if (score >= 70)
      return {
        bg: "bg-green-500",
        text: "text-green-500",
        ring: "ring-green-500",
      };
    if (score >= 50)
      return {
        bg: "bg-yellow-500",
        text: "text-yellow-500",
        ring: "ring-yellow-500",
      };
    return { bg: "bg-red-500", text: "text-red-500", ring: "ring-red-500" };
  };

  const getSizeClasses = () => {
    switch (size) {
      case "sm":
        return { container: "w-12 h-12", text: "text-xs", icon: "h-3 w-3" };
      case "lg":
        return { container: "w-24 h-24", text: "text-xl", icon: "h-5 w-5" };
      default:
        return { container: "w-16 h-16", text: "text-sm", icon: "h-4 w-4" };
    }
  };

  const getIcon = () => {
    if (score >= 70) return <TrendingUp className={sizeClasses.icon} />;
    if (score <= 35) return <TrendingDown className={sizeClasses.icon} />;
    return <Minus className={sizeClasses.icon} />;
  };

  const colors = getColor();
  const sizeClasses = getSizeClasses();

  // Calculate stroke dasharray for circular progress
  const radius = size === "sm" ? 20 : size === "lg" ? 44 : 28;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div
      className={`flex flex-col items-center ${className}`}
      data-testid="deal-score-indicator"
      role="img"
      aria-label={`${t("ai.dealScore")}: ${score}%`}
    >
      <div className={`relative ${sizeClasses.container}`}>
        {/* Background circle */}
        <svg className="w-full h-full transform -rotate-90">
          <circle
            cx="50%"
            cy="50%"
            r={radius}
            fill="none"
            stroke={isDark ? "#374151" : "#E5E7EB"}
            strokeWidth="4"
          />
          {/* Progress circle */}
          <motion.circle
            cx="50%"
            cy="50%"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            className={colors.text}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 1, ease: "easeOut" }}
            style={{
              strokeDasharray: circumference,
            }}
          />
        </svg>

        {/* Score text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            className={`font-bold ${colors.text} ${sizeClasses.text}`}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5, duration: 0.3 }}
          >
            {score}%
          </motion.span>
        </div>
      </div>

      {/* Label */}
      {showLabel && (
        <div className={`mt-2 flex items-center gap-1 ${colors.text}`}>
          {getIcon()}
          <span className={`text-xs font-medium`}>
            {category ? t(`ai.${category}`) : t("ai.dealScore")}
          </span>
        </div>
      )}
    </div>
  );
});

export default DealScoreIndicator;
