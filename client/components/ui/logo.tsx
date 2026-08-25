import { motion, type Variants } from "framer-motion";
import { cn } from "@/lib/utils";
import { useSettings } from "@/lib/context/SettingsContext";

interface LogoProps {
  showText?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  glow?: boolean;
  authMode?: boolean; // Special styling for auth pages (login/reset password)
  animateTypewriter?: boolean; // Typewriter effect for brand letters
}

const sizeClasses = {
  sm: {
    logo: "h-6 w-6",
    text: "text-sm",
  },
  md: {
    logo: "h-8 w-8",
    text: "text-lg",
  },
  lg: {
    logo: "h-12 w-12",
    text: "text-2xl",
  },
  xl: {
    logo: "h-20 w-20",
    text: "text-3xl",
  },
};

const sentenceVariants: Variants = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.045,
      delayChildren: 0.05,
    },
  },
};

const letterVariants: Variants = {
  hidden: { opacity: 0, y: 3 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.15,
      ease: "easeOut",
    },
  },
};

export function Logo({
  showText = true,
  size = "md",
  className,
  glow = false,
  authMode = false,
  animateTypewriter = true,
}: LogoProps) {
  const sizes = sizeClasses[size];
  const { settings } = useSettings();
  const displayName = settings.appName || "SmartLogistics";

  const letters = displayName.split("");

  return (
    <div className={cn("flex items-center gap-2 select-none group/logo", className)}>
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className={cn(
          "relative shrink-0",
          // Auth mode: add padding and border glow
          authMode && [
            "p-3 rounded-2xl",
            // Black/gray border glow effect - monochromatic
            "shadow-[0_0_20px_rgba(0,0,0,0.4),0_0_40px_rgba(0,0,0,0.3),0_0_60px_rgba(0,0,0,0.2)]",
            "animate-pulse-slow",
            // Inner gray border
            "ring-1 ring-gray-700/30",
            // Subtle gray gradient background
            "bg-gradient-to-br from-gray-900/5 to-gray-800/5",
          ],
        )}
      >
        <motion.img
          whileHover={{ y: -2, rotate: [-1, 1, 0] }}
          transition={{ duration: 0.3 }}
          src="/logo.svg"
          alt={`${displayName} Logo`}
          className={cn(
            sizes.logo,
            "object-contain relative z-10",
            // Auth mode: invert colors (yellow→black, black→white)
            authMode && [
              "invert", // Invert all colors
              "drop-shadow-[0_0_8px_rgba(0,0,0,0.5)]", // Black/gray glow on the logo itself
            ],
          )}
        />
      </motion.div>
      {showText && (
        <span className={cn("font-bold text-[#a80010] dark:text-[#e8152d] flex items-center tracking-tight", sizes.text)}>
          {animateTypewriter ? (
            <motion.span
              variants={sentenceVariants}
              initial="hidden"
              animate="visible"
              className="inline-flex items-center"
            >
              {letters.map((char, index) => (
                <motion.span
                  key={`${char}-${index}`}
                  variants={letterVariants}
                  className="inline-block"
                >
                  {char === " " ? "\u00A0" : char}
                </motion.span>
              ))}
              {/* Typewriter blinking red cursor that fades after typing */}
              <motion.span
                initial={{ opacity: 1 }}
                animate={{ opacity: [1, 0, 1, 0, 1, 0] }}
                transition={{
                  duration: 1.6,
                  times: [0, 0.2, 0.4, 0.6, 0.8, 1],
                  ease: "easeInOut",
                }}
                className="inline-block w-[2px] h-[1em] bg-[#a80010] dark:bg-[#e8152d] ml-0.5 align-middle rounded-full"
              />
            </motion.span>
          ) : (
            displayName
          )}
        </span>
      )}
    </div>
  );
}
