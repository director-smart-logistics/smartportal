import { memo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plane, Ship, Sparkles, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ManifestType } from "@/lib/services/manifest-processor";

interface OriginHub {
  id: ManifestType;
  country: string;
  countryCode: string;
  shippingType: "air" | "sea";
  label: string;
  description: string;
}

const ORIGIN_HUBS: OriginHub[] = [
  {
    id: "usa_air",
    country: "USA",
    countryCode: "us",
    shippingType: "air",
    label: "USA Aéreo",
    description: "Miami — Carga aérea",
  },
  {
    id: "usa_sea",
    country: "USA",
    countryCode: "us",
    shippingType: "sea",
    label: "USA Marítimo",
    description: "Miami — Carga marítima",
  },
  {
    id: "colombia_air",
    country: "Colombia",
    countryCode: "co",
    shippingType: "air",
    label: "Colombia Aéreo",
    description: "Bogotá — Carga aérea",
  },
];

interface StepOriginProps {
  onSelect: (manifestType: ManifestType) => void;
}

export const StepOrigin = memo(function StepOrigin({
  onSelect,
}: StepOriginProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleSelect = (hub: OriginHub) => {
    setSelectedId(hub.id);
    setTimeout(() => onSelect(hub.id), 600);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-8rem)] px-4 sm:px-6">
      {/* AI Header */}
      <motion.div
        className="flex flex-col items-center mb-10 sm:mb-14"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      >
        <motion.div
          className="relative mb-5"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.5 }}
        >
          <motion.div
            className="absolute inset-0 blur-2xl rounded-full scale-150"
            style={{ background: "hsl(var(--manifest-brand) / 0.12)" }}
            animate={{ scale: [1.5, 1.9, 1.5], opacity: [0.2, 0.45, 0.2] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            animate={{ y: [0, -5, 0] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
            className="relative flex items-center justify-center w-14 h-14 rounded-2xl"
            style={{ background: "hsl(var(--manifest-brand))" }}
          >
            <Sparkles className="w-7 h-7 text-white" />
          </motion.div>
        </motion.div>

        <motion.h1
          className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight text-center"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.5 }}
        >
          ¿De dónde viene el manifiesto?
        </motion.h1>
        <motion.p
          className="text-sm text-muted-foreground mt-2 text-center max-w-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.4 }}
        >
          Selecciona el hub de origen para configurar automáticamente el
          formato, precios y validaciones.
        </motion.p>
      </motion.div>

      {/* Hub Cards Grid */}
      <motion.div
        className="grid grid-cols-1 sm:grid-cols-3 gap-6 w-full max-w-3xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.5 }}
      >
        <AnimatePresence>
          {ORIGIN_HUBS.map((hub, idx) => {
            const isSelected = selectedId === hub.id;
            const isHovered = hoveredId === hub.id;
            const isOtherSelected = selectedId !== null && !isSelected;

            return (
              <motion.button
                key={hub.id}
                type="button"
                onClick={() => handleSelect(hub)}
                onMouseEnter={() => setHoveredId(hub.id)}
                onMouseLeave={() => setHoveredId(null)}
                disabled={selectedId !== null}
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{
                  opacity: isOtherSelected ? 0.3 : 1,
                  y: 0,
                  scale: isSelected ? 1.05 : isOtherSelected ? 0.95 : 1,
                }}
                transition={{
                  delay: 0.4 + idx * 0.08,
                  duration: 0.4,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className={cn(
                  "relative group flex flex-col items-start p-5 rounded-2xl border-2 text-left transition-all duration-300 cursor-pointer",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                  isSelected
                    ? "border-[hsl(var(--manifest-brand))] bg-[hsl(var(--manifest-brand-subtle))] shadow-lg"
                    : "border-border bg-background hover:border-[hsl(var(--manifest-brand)/0.5)] hover:shadow-md",
                  "disabled:cursor-default",
                )}
                style={{
                  outlineColor: "hsl(var(--manifest-brand))",
                }}
                aria-label={`Seleccionar ${hub.label}`}
              >
                {/* Selection indicator */}
                <AnimatePresence>
                  {isSelected && (
                    <motion.div
                      className="absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center"
                      style={{ background: "hsl(var(--manifest-brand))" }}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <ArrowRight className="w-3.5 h-3.5 text-white" />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Flag + Icon row */}
                <div className="flex items-center gap-3 mb-3">
                  <img
                    src={`https://flagcdn.com/w80/${hub.countryCode}.png`}
                    srcSet={`https://flagcdn.com/w160/${hub.countryCode}.png 2x`}
                    alt={hub.country}
                    className="w-8 h-6 object-cover rounded-sm"
                    loading="eager"
                  />
                  <div
                    className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center transition-colors duration-300",
                      isSelected || isHovered
                        ? "bg-[hsl(var(--manifest-brand))] text-white"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {hub.shippingType === "air" ? (
                      <Plane className="w-4 h-4" />
                    ) : (
                      <Ship className="w-4 h-4" />
                    )}
                  </div>
                </div>

                {/* Label */}
                <span className="text-base font-semibold text-foreground">
                  {hub.label}
                </span>
                <span className="text-xs text-muted-foreground mt-0.5">
                  {hub.description}
                </span>

                {/* Bottom accent line */}
                <motion.div
                  className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full"
                  style={{ background: "hsl(var(--manifest-brand))" }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: isSelected || isHovered ? 1 : 0 }}
                  transition={{ duration: 0.3 }}
                />
              </motion.button>
            );
          })}
        </AnimatePresence>
      </motion.div>

      {/* Keyboard hint */}
      <motion.p
        className="mt-8 text-xs text-muted-foreground/60"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
      >
        Haz clic para seleccionar el origen
      </motion.p>
    </div>
  );
});
