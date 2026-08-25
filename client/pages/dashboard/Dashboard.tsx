import { useState, useEffect, useMemo, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import {
  RefreshCw,
  Bot,
  FileSpreadsheet,
  Truck,
  Receipt,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Daily Hero Titles: 3 variations for each day of the week (21 total) ────────

const DAILY_HERO_TITLES: Record<number, string[]> = {
  // 1: Lunes
  1: [
    "Iniciamos la semana con foco y determinación",
    "Cada gran semana comienza con un paso impecable",
    "Construyamos una semana de excelencia y resultados",
  ],
  // 2: Martes
  2: [
    "Mantén el ritmo, la constancia y la excelencia",
    "El impulso de hoy construye la tranquilidad de mañana",
    "Precisión en cada detalle: cada entrega cuenta",
  ],
  // 3: Miércoles
  3: [
    "Mitad de semana: energía y foco en cada acción",
    "La maestría operativa se demuestra en la constancia",
    "Avanzamos con serenidad, claridad y profesionalismo",
  ],
  // 4: Jueves
  4: [
    "Consolidando resultados con dedicación y esmero",
    "El esfuerzo de hoy prepara el camino al éxito",
    "Calidad y calidez en cada servicio que brindamos",
  ],
  // 5: Viernes
  5: [
    "Cerremos la semana con orgullo y máxima calidad",
    "La satisfacción de dar el 100% en cada jornada",
    "Culminando una gran semana de trabajo bien hecho",
  ],
  // 6: Sábado
  6: [
    "Jornada de coordinación, agilidad y eficiencia",
    "Servicio impecable y cercanía con cada cliente",
    "Cada entrega realizada es confianza ganada",
  ],
  // 0: Domingo
  0: [
    "Preparando el camino para una semana exitosa",
    "Serenidad, visión y enfoque para lo que viene",
    "La constancia y la calma siempre marcan la diferencia",
  ],
};

// ── Inspiring quotes from philosophers, thinkers and visionaries ─────────────

interface MotivationalQuote {
  quote: string;
  author: string;
  category: "morning" | "afternoon" | "evening" | "any";
}

const MOTIVATIONAL_QUOTES: MotivationalQuote[] = [
  {
    quote: "Tienes poder sobre tu mente, no sobre los acontecimientos. Comprende esto y hallarás tu fuerza.",
    author: "Marco Aurelio",
    category: "morning",
  },
  {
    quote: "Somos lo que hacemos repetidamente. La excelencia, por tanto, no es un acto, sino un hábito.",
    author: "Aristóteles",
    category: "morning",
  },
  {
    quote: "El viaje de mil millas comienza siempre con un solo paso firme.",
    author: "Lao Tse",
    category: "morning",
  },
  {
    quote: "No importa qué tan lento vayas, siempre y cuando no te detengas.",
    author: "Confucio",
    category: "afternoon",
  },
  {
    quote: "No nos atrevemos a muchas cosas porque son difíciles; son difíciles porque no nos atrevemos.",
    author: "Séneca",
    category: "afternoon",
  },
  {
    quote: "En medio de las dificultades y los retos diarios, siempre reside la gran oportunidad.",
    author: "Sun Tzu",
    category: "afternoon",
  },
  {
    quote: "Cuando ya no podemos cambiar una situación, tenemos el desafío de cambiarnos a nosotros mismos.",
    author: "Víktor Frankl",
    category: "evening",
  },
  {
    quote: "Lo que está detrás y delante de nosotros son pequeñeces ante lo que está en nuestro interior.",
    author: "Ralph Waldo Emerson",
    category: "evening",
  },
  {
    quote: "El éxito es la capacidad de avanzar ante cada reto sin perder jamás el entusiasmo.",
    author: "Winston Churchill",
    category: "any",
  },
  {
    quote: "No te elevas al nivel de tus metas, caes al nivel de tus sistemas y tu constancia diaria.",
    author: "James Clear",
    category: "any",
  },
];

// ── Exact high-priority management chips ──────────────────────────────────────

const SUGGESTION_CHIPS = [
  {
    label: "Nova",
    prompt: "Consultas y análisis inteligente",
    to: "/nova",
    icon: <Bot className="h-4 w-4 text-[#a80010] dark:text-rose-400" />,
  },
  {
    label: "Facturación",
    prompt: "Cobros y gestión de facturas",
    to: "/invoices",
    icon: <Receipt className="h-4 w-4 text-[#a80010] dark:text-rose-400" />,
  },
  {
    label: "Consolidación Transitoria",
    prompt: "Gestión de paquetes consolidados",
    to: "/consolidation/manifests",
    icon: <FileSpreadsheet className="h-4 w-4 text-[#a80010] dark:text-rose-400" />,
  },
  {
    label: "Manifiesto de Encomiendas",
    prompt: "Control de envíos y encomiendas",
    to: "/encomiendas/manifests",
    icon: <Truck className="h-4 w-4 text-[#a80010] dark:text-rose-400" />,
  },
  {
    label: "Devoluciones",
    prompt: "Control de paquetes devueltos",
    to: "/consolidation/returned",
    icon: <RotateCcw className="h-4 w-4 text-[#a80010] dark:text-rose-400" />,
  },
];

// ── Floating Hot Air Balloon Background Animation ─────────────────────────────

const FloatingHotAirBalloon = memo(function FloatingHotAirBalloon() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden flex items-center justify-center z-0 select-none">
      {/* Ambient warm light glow */}
      <div className="absolute w-[500px] h-[500px] bg-gradient-to-tr from-[#a80010]/4 via-amber-500/3 to-transparent rounded-full blur-3xl pointer-events-none" />

      {/* Floating Hot Air Balloon Logo */}
      <motion.div
        animate={{
          y: [-18, 14, -18],
          x: [-8, 10, -8],
          rotate: [-3, 3, -3],
        }}
        transition={{
          duration: 7.5,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="relative opacity-10 dark:opacity-15"
      >
        <motion.img
          src="/logo.svg"
          alt=""
          aria-hidden="true"
          animate={{
            scale: [0.96, 1.04, 0.96],
            opacity: [0.08, 0.16, 0.08],
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="w-72 h-72 sm:w-88 sm:h-88 md:w-[420px] md:h-[420px] object-contain filter drop-shadow-2xl"
        />
      </motion.div>
    </div>
  );
});

// ── Knight Rider (Auto Fantástico) Glowing Animated Light Bar ──────────────────

const KnightRiderGlowBar = memo(function KnightRiderGlowBar() {
  return (
    <div className="relative w-full max-w-2xl mx-auto h-[2px] mt-10 overflow-hidden select-none [mask-image:linear-gradient(to_right,transparent,white_15%,white_85%,transparent)]">
      {/* Subtle background baseline track with soft fade */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#a80010]/20 to-transparent" />

      {/* Sweeping Glowing Pulse (Auto Fantástico effect) */}
      <motion.div
        animate={{
          x: ["-100%", "240%"],
        }}
        transition={{
          duration: 2.6,
          repeat: Infinity,
          ease: "easeInOut",
          repeatType: "reverse",
        }}
        className="absolute top-0 h-[2px] w-48 bg-gradient-to-r from-transparent via-[#e8152d] to-transparent shadow-[0_0_14px_3px_rgba(232,21,45,0.75)] dark:shadow-[0_0_16px_3px_rgba(255,77,100,0.85)]"
      />

      {/* Secondary softer halo light trailing */}
      <motion.div
        animate={{
          x: ["-100%", "240%"],
        }}
        transition={{
          duration: 2.6,
          repeat: Infinity,
          ease: "easeInOut",
          repeatType: "reverse",
        }}
        className="absolute -top-1 h-[4px] w-64 bg-gradient-to-r from-transparent via-[#a80010]/40 to-transparent blur-xs pointer-events-none"
      />
    </div>
  );
});

export default function Dashboard() {
  const { user } = useAuth();

  // Hourly contextual greeting & daily hero headline
  const timeContext = useMemo(() => {
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();
    const dayOfMonth = now.getDate();
    const weekVariation = Math.floor((dayOfMonth - 1) / 7) % 3;

    const titlesForToday = DAILY_HERO_TITLES[dayOfWeek] || DAILY_HERO_TITLES[1];
    const heroTitle = titlesForToday[weekVariation] || titlesForToday[0];

    let greeting = "Buenos días";
    let period: "morning" | "afternoon" | "evening" = "morning";

    if (hour >= 12 && hour < 18) {
      greeting = "Buenas tardes";
      period = "afternoon";
    } else if (hour >= 18 || hour < 5) {
      greeting = "Buenas noches";
      period = "evening";
    }

    return {
      greeting,
      period,
      heroTitle,
    };
  }, []);

  const activeQuotes = useMemo(() => {
    return MOTIVATIONAL_QUOTES.filter(
      q => q.category === timeContext.period || q.category === "any"
    );
  }, [timeContext.period]);

  const [quoteIndex, setQuoteIndex] = useState(0);

  // Auto-rotate quote smoothly every 14 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setQuoteIndex(prev => (prev + 1) % activeQuotes.length);
    }, 14000);
    return () => clearInterval(timer);
  }, [activeQuotes.length]);

  const handleNextQuote = useCallback(() => {
    setQuoteIndex(prev => (prev + 1) % activeQuotes.length);
  }, [activeQuotes.length]);

  const currentQuote = activeQuotes[quoteIndex] || activeQuotes[0];

  const firstName = useMemo(() => {
    if (!user?.fullName) return "Equipo";
    return user.fullName.split(" ")[0] || user.fullName;
  }, [user?.fullName]);

  return (
    <DashboardLayout hideBreadcrumb>
      <div className="relative flex flex-col justify-center min-h-[calc(100vh-4rem)] px-4 sm:px-6 py-12 overflow-hidden">
        {/* Floating Hot Air Balloon Animated Background */}
        <FloatingHotAirBalloon />

        <div className="relative z-10 mx-auto w-full max-w-3xl">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* ── Greeting Row (Logo + Hola) ── */}
            <div className="mb-1 flex items-center gap-2.5">
              <img src="/logo.svg" alt="SmartLogistics" className="h-7 w-7 object-contain" />
              <p className="text-2xl text-[#1f1f1f] dark:text-gray-100 font-normal">
                ¡{timeContext.greeting}, <span className="font-semibold">{firstName}</span>!
              </p>
            </div>

            {/* ── Hero Text (Daily Headline with 3 monthly variations) ── */}
            <p className="mb-6 text-[2.5rem] md:text-[3.25rem] leading-tight font-normal bg-gradient-to-r from-[#1f1f1f] via-[#a80010] to-[#e8152d] dark:from-white dark:via-[#ff4d64] dark:to-[#e8152d] bg-clip-text text-transparent">
              {timeContext.heroTitle}
            </p>

            {/* ── Stable Quote Container: ZERO UI Layout Shifts / No Jumps ── */}
            <div className="mb-8">
              {/* Fixed-height container to ensure zero pixel movement on text change */}
              <div className="h-[84px] sm:h-[72px] relative flex items-center">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={quoteIndex}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.22, ease: "easeInOut" }}
                    className="w-full space-y-1 text-left"
                  >
                    <p className="text-base sm:text-lg text-[#444746] dark:text-zinc-300 font-light italic leading-relaxed line-clamp-2">
                      “{currentQuote.quote}”
                    </p>
                    <p className="text-xs text-muted-foreground/80 font-medium">
                      — {currentQuote.author}
                    </p>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Minimal Dots & Switcher */}
              <div className="flex items-center gap-3 pt-1">
                <div className="flex items-center gap-1.5">
                  {activeQuotes.map((_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setQuoteIndex(idx)}
                      aria-label={`Ver cita ${idx + 1}`}
                      className={cn(
                        "h-1.5 rounded-full transition-all duration-300",
                        idx === quoteIndex
                          ? "w-5 bg-[#a80010] dark:bg-rose-500"
                          : "w-1.5 bg-muted-foreground/20 hover:bg-muted-foreground/40"
                      )}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleNextQuote}
                  className="text-[11px] text-muted-foreground hover:text-[#a80010] dark:hover:text-rose-400 flex items-center gap-1 transition-colors"
                >
                  <RefreshCw className="h-2.5 w-2.5" />
                  <span>Siguiente</span>
                </button>
              </div>
            </div>

            {/* ── Nova Suggestion Chips (Exact 5 Management Priority Tools) ── */}
            <div className="flex flex-wrap gap-2.5">
              {SUGGESTION_CHIPS.map((chip) => (
                <Link
                  key={chip.to}
                  to={chip.to}
                  className="nova-chip flex items-center gap-2 rounded-xl px-4 py-2.5 text-[#444746] dark:text-gray-200 text-sm font-medium transition-all hover:shadow-sm active:scale-[0.98]"
                >
                  {chip.icon}
                  <span>{chip.label}</span>
                </Link>
              ))}
            </div>

            {/* ── Glowing Knight Rider (Auto Fantástico) Animated Light Bar ── */}
            <KnightRiderGlowBar />
          </motion.div>
        </div>
      </div>
    </DashboardLayout>
  );
}
