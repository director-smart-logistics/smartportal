import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface GlowButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  loadingText?: string;
  children: React.ReactNode;
  variant?: "light" | "dark";
}

export const GlowButton = forwardRef<HTMLButtonElement, GlowButtonProps>(
  (
    {
      className,
      children,
      isLoading,
      loadingText,
      variant = "dark",
      disabled,
      ...props
    },
    ref,
  ) => {
    const isDark = variant === "dark";

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          "relative w-full h-11 font-semibold text-base rounded-lg transition-all duration-300",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          isDark
            ? "bg-black text-white hover:bg-gray-900"
            : "bg-white text-black hover:bg-gray-100",
          // Glow effect
          !disabled && !isLoading && "shadow-[0_0_20px_rgba(255,255,255,0.3)]",
          !disabled &&
            !isLoading &&
            isDark &&
            "hover:shadow-[0_0_30px_rgba(255,255,255,0.5)]",
          !disabled &&
            !isLoading &&
            !isDark &&
            "hover:shadow-[0_0_30px_rgba(0,0,0,0.4)]",
          // Animation
          "before:absolute before:inset-0 before:rounded-lg before:opacity-0 before:transition-opacity before:duration-300",
          !disabled &&
            !isLoading &&
            isDark &&
            "before:bg-gradient-to-r before:from-white/10 before:via-white/5 before:to-transparent",
          !disabled &&
            !isLoading &&
            !isDark &&
            "before:bg-gradient-to-r before:from-black/10 before:via-black/5 before:to-transparent",
          !disabled &&
            !isLoading &&
            "hover:before:opacity-100 hover:before:animate-shimmer",
          className,
        )}
        {...props}
      >
        <span className="relative z-10 flex items-center justify-center">
          {isLoading ? (
            <>
              <Loader2
                className="h-4 w-4 mr-2 animate-spin"
                aria-hidden="true"
              />
              {loadingText || children}
            </>
          ) : (
            children
          )}
        </span>
      </button>
    );
  },
);

GlowButton.displayName = "GlowButton";
