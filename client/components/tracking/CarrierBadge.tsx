import { memo } from "react";
import { Sparkles } from "lucide-react";

interface CarrierPattern {
  name: string;
  prefixes: string[];
  lengthRange: [number, number];
  pattern?: RegExp;
  score: number;
}

const CARRIER_PATTERNS: CarrierPattern[] = [
  {
    name: "USPS",
    prefixes: [
      "9400",
      "9405",
      "9200",
      "9300",
      "9205",
      "9208",
      "9270",
      "9274",
      "9261",
      "9407",
      "9449",
      "9202",
      "9302",
    ],
    lengthRange: [20, 22],
    pattern: /^9[234]\d{18,20}$/,
    score: 100,
  },
  {
    name: "USPS-Long",
    prefixes: ["420"],
    lengthRange: [28, 34],
    pattern: /^420\d{25,31}$/,
    score: 90,
  },
  {
    name: "USPS-IMpb",
    prefixes: ["92", "93", "94"],
    lengthRange: [22, 34],
    pattern: /^9[234]\d{20,32}$/,
    score: 85,
  },
  {
    name: "FedEx",
    prefixes: ["96", "98", "61"],
    lengthRange: [12, 22],
    pattern: /^(96|98|61)\d{10,20}$/,
    score: 80,
  },
  {
    name: "FedEx-SmartPost",
    prefixes: ["92"],
    lengthRange: [22, 34],
    pattern: /^92\d{20,32}$/,
    score: 75,
  },
  {
    name: "FedEx-Ground",
    prefixes: [""],
    lengthRange: [12, 15],
    pattern: /^\d{12,15}$/,
    score: 70,
  },
  {
    name: "UPS",
    prefixes: ["1Z"],
    lengthRange: [18, 18],
    pattern: /^1Z[A-Z0-9]{16}$/,
    score: 95,
  },
  {
    name: "DHL",
    prefixes: [""],
    lengthRange: [10, 11],
    pattern: /^\d{10,11}$/,
    score: 60,
  },
  {
    name: "Amazon-TBA",
    prefixes: ["TBA"],
    lengthRange: [12, 15],
    pattern: /^TBA\d{9,12}$/,
    score: 85,
  },
  {
    name: "Generic",
    prefixes: [""],
    lengthRange: [10, 30],
    pattern: /^\d{10,30}$/,
    score: 50,
  },
];

function detectCarrier(tracking: string): {
  carrier: string;
  confidence: number;
} {
  const cleaned = tracking.trim().toUpperCase();
  let best = { carrier: "Unknown", confidence: 0 };
  for (const p of CARRIER_PATTERNS) {
    if (p.pattern && p.pattern.test(cleaned) && p.score > best.confidence) {
      best = { carrier: p.name, confidence: p.score };
    }
    for (const prefix of p.prefixes) {
      if (prefix && cleaned.startsWith(prefix)) {
        const score = p.score + 10;
        if (score > best.confidence)
          best = { carrier: p.name, confidence: score };
      }
    }
  }
  return best;
}

interface CarrierBadgeProps {
  tracking: string;
}

export const CarrierBadge = memo(function CarrierBadge({
  tracking,
}: CarrierBadgeProps) {
  const { carrier, confidence } = detectCarrier(tracking);
  if (carrier === "Unknown" || confidence < 50) return null;
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[10px] font-medium text-gray-400 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5"
      aria-label={`Carrier: ${carrier}`}
    >
      <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
      {carrier}
    </span>
  );
});

CarrierBadge.displayName = "CarrierBadge";
