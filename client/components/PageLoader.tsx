import { memo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Animated Hot Air Balloon Logo Loader
 * Features gentle lifting, swaying, and subtle light pulse construction effect.
 */
export const LogoLoader = memo(function LogoLoader({
  size = "md",
  label = "Cargando...",
  className,
}: {
  size?: "sm" | "md" | "lg";
  label?: string;
  className?: string;
}) {
  const sizeMap = {
    sm: { container: "h-16 w-16", logo: "h-10 w-10", ring: "h-14 w-14", text: "text-xs" },
    md: { container: "h-24 w-24", logo: "h-16 w-16", ring: "h-20 w-20", text: "text-sm" },
    lg: { container: "h-32 w-32", logo: "h-20 w-20", ring: "h-28 w-28", text: "text-base" },
  };

  const currentSize = sizeMap[size] || sizeMap.md;

  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 select-none", className)}>
      <div className={cn("relative flex items-center justify-center", currentSize.container)}>
        {/* Soft expanding pulse ring */}
        <motion.div
          animate={{
            scale: [0.85, 1.3, 0.85],
            opacity: [0.35, 0.05, 0.35],
          }}
          transition={{
            duration: 2.8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className={cn(
            "absolute rounded-full bg-gradient-to-tr from-[#a80010]/30 via-amber-500/20 to-transparent blur-md",
            currentSize.ring
          )}
        />

        {/* Floating, swaying hot air balloon logo */}
        <motion.div
          animate={{
            y: [-6, 6, -6],
            rotate: [-2.5, 2.5, -2.5],
            scale: [0.98, 1.03, 0.98],
          }}
          transition={{
            duration: 3.2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="relative z-10 flex items-center justify-center"
        >
          <img
            src="/logo.svg"
            alt="SmartLogistics"
            className={cn("object-contain filter drop-shadow-md", currentSize.logo)}
          />

          {/* Shimmer light sweep across logo */}
          <motion.div
            animate={{
              x: ["-120%", "140%"],
              opacity: [0, 0.8, 0],
            }}
            transition={{
              duration: 2.4,
              repeat: Infinity,
              ease: "easeInOut",
              repeatDelay: 0.6,
            }}
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent skew-x-12 pointer-events-none"
          />
        </motion.div>
      </div>

      {label && (
        <span className="text-[10px] font-normal text-muted-foreground/40 dark:text-zinc-500/40 tracking-wider">
          {label}
        </span>
      )}
    </div>
  );
});

/**
 * Full page loading fallback component for lazy-loaded pages
 */
export function PageLoader({ label = "Cargando..." }: { label?: string }) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background/80 backdrop-blur-xs">
      <LogoLoader size="lg" label={label} />
    </div>
  );
}

/**
 * Inline loader for smaller sections & widgets
 */
export function InlineLoader({ label = "Cargando..." }: { label?: string }) {
  return (
    <div className="flex items-center justify-center p-8">
      <LogoLoader size="sm" label={label} />
    </div>
  );
}
