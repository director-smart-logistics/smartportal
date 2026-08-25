import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useLocale } from "@/hooks/useLocale";
import { DollarSign, Plane, Ship, Save, RefreshCw, Info } from "lucide-react";
import { firestoreApi } from "@/lib/firebase/firestore-client";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const COUNTRIES = [
  { id: "usa", name: "USA", flag: "🇺🇸", currency: "USD" },
  { id: "mexico", name: "México", flag: "🇲🇽", currency: "USD" },
  { id: "china", name: "China", flag: "🇨🇳", currency: "USD" },
  { id: "colombia", name: "Colombia", flag: "🇨🇴", currency: "USD" },
];

interface PricingData {
  regular?: {
    "0-499g"?: number;
    "500g-1kg"?: number;
    per_kg?: number;
  };
  restricted?: {
    base?: number;
    tracking_fee?: number;
    per_kg?: number;
  };
  currency?: string;
}

interface PricingState {
  tier0_499g: number;
  tier500g_1kg: number;
  tierPerKg: number;
  fractionSmall: number;
  fractionLarge: number;
  restrictedSurcharge: number;
  currency: string;
}

const DEFAULT_PRICING: PricingState = {
  tier0_499g: 8,
  tier500g_1kg: 12,
  tierPerKg: 12,
  fractionSmall: 8,
  fractionLarge: 12,
  restrictedSurcharge: 3,
  currency: "USD",
};

export function PricingManagementNew() {
  const { t } = useLocale(["settings", "common"]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedCountry, setSelectedCountry] = useState("usa");
  const [selectedShipping, setSelectedShipping] = useState("air");
  const [pricing, setPricing] = useState<PricingState>(DEFAULT_PRICING);
  const [hasChanges, setHasChanges] = useState(false);

  const configId = `${selectedCountry}-${selectedShipping}`;

  const { data: pricingData, isLoading } = useQuery<PricingData | null>({
    queryKey: ["pricing", selectedCountry, selectedShipping],
    queryFn: async () => {
      const result = await firestoreApi.pricing.getConfig(
        selectedCountry,
        selectedShipping,
      );
      return (result?.[0] as PricingData) || null;
    },
  });

  useEffect(() => {
    if (pricingData) {
      setPricing({
        tier0_499g: pricingData.regular?.["0-499g"] || 8,
        tier500g_1kg: pricingData.regular?.["500g-1kg"] || 12,
        tierPerKg: pricingData.regular?.per_kg || 12,
        fractionSmall: 8,
        fractionLarge: 12,
        restrictedSurcharge: pricingData.restricted?.tracking_fee || 3,
        currency: pricingData.currency || "USD",
      });
      setHasChanges(false);
    }
  }, [pricingData]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      return await firestoreApi.pricing.update(configId, {
        country: selectedCountry,
        shippingType: selectedShipping,
        currency: pricing.currency,
        regular: {
          "0-499g": pricing.tier0_499g,
          "500g-1kg": pricing.tier500g_1kg,
          per_kg: pricing.tierPerKg,
        },
        restricted: {
          base: pricing.tier500g_1kg,
          tracking_fee: pricing.restrictedSurcharge,
          per_kg: pricing.tierPerKg,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["pricing", selectedCountry, selectedShipping],
      });
      setHasChanges(false);
      toast({
        title: "Guardado",
        description: "Tarifas actualizadas correctamente",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo guardar",
        variant: "destructive",
      });
    },
  });

  const updatePricing = (key: keyof PricingState, value: number | string) => {
    setPricing((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleReset = () => {
    if (pricingData) {
      setPricing({
        tier0_499g: pricingData.regular?.["0-499g"] || 8,
        tier500g_1kg: pricingData.regular?.["500g-1kg"] || 12,
        tierPerKg: pricingData.regular?.per_kg || 12,
        fractionSmall: 8,
        fractionLarge: 12,
        restrictedSurcharge: pricingData.restricted?.tracking_fee || 3,
        currency: pricingData.currency || "USD",
      });
    } else {
      setPricing(DEFAULT_PRICING);
    }
    setHasChanges(false);
  };

  const calculateExample = (weightKg: number): number => {
    if (weightKg <= 0.499) return pricing.tier0_499g;
    if (weightKg <= 1) return pricing.tier500g_1kg;

    let total = pricing.tierPerKg;
    const extraWeight = weightKg - 1;
    const fullKgs = Math.floor(extraWeight);
    const fractionKg = extraWeight - fullKgs;

    total += fullKgs * pricing.tierPerKg;
    if (fractionKg > 0) {
      total +=
        fractionKg >= 0.5 ? pricing.fractionLarge : pricing.fractionSmall;
    }
    return total;
  };

  const country = COUNTRIES.find((c) => c.id === selectedCountry);

  return (
    <div className="space-y-4">
      {/* Header with selectors */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            <span className="font-semibold">Tarifas</span>
          </div>

          <div className="flex items-center gap-2">
            <Label className="text-sm">País:</Label>
            <Select value={selectedCountry} onValueChange={setSelectedCountry}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COUNTRIES.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="flex items-center gap-2">
                      <span>{c.flag}</span>
                      <span>{c.name}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Label className="text-sm">Envío:</Label>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant={selectedShipping === "air" ? "default" : "outline"}
                onClick={() => setSelectedShipping("air")}
                className="h-8"
              >
                <Plane className="h-3.5 w-3.5 mr-1" />
                Aéreo
              </Button>
              <Button
                size="sm"
                variant={selectedShipping === "sea" ? "default" : "outline"}
                onClick={() => setSelectedShipping("sea")}
                className="h-8"
              >
                <Ship className="h-3.5 w-3.5 mr-1" />
                Marítimo
              </Button>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {hasChanges && (
              <span className="text-xs text-amber-600">Sin guardar</span>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={handleReset}
              disabled={!hasChanges}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Resetear
            </Button>
            <Button
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={!hasChanges || saveMutation.isPending}
              className="bg-primary"
            >
              <Save className="h-3.5 w-3.5 mr-1" />
              {saveMutation.isPending ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </div>
      </Card>

      {/* Loading */}
      {isLoading && (
        <Card className="p-8 flex items-center justify-center">
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
        </Card>
      )}

      {/* Pricing Grid */}
      {!isLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Tiered Pricing */}
          <Card className="p-4">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <span className="text-lg">{country?.flag}</span>
              Tarifas Escalonadas (
              {selectedShipping === "air" ? "Aéreo" : "Marítimo"})
            </h3>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">
                    0-499g
                  </Label>
                  <div className="flex items-center gap-1">
                    <span className="text-sm">$</span>
                    <Input
                      type="number"
                      value={pricing.tier0_499g}
                      onChange={(e) =>
                        updatePricing(
                          "tier0_499g",
                          parseFloat(e.target.value) || 0,
                        )
                      }
                      className="h-8 w-20 font-mono"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">
                    500g-1kg
                  </Label>
                  <div className="flex items-center gap-1">
                    <span className="text-sm">$</span>
                    <Input
                      type="number"
                      value={pricing.tier500g_1kg}
                      onChange={(e) =>
                        updatePricing(
                          "tier500g_1kg",
                          parseFloat(e.target.value) || 0,
                        )
                      }
                      className="h-8 w-20 font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Por kg adicional
                  </Label>
                  <div className="flex items-center gap-1">
                    <span className="text-sm">$</span>
                    <Input
                      type="number"
                      value={pricing.tierPerKg}
                      onChange={(e) =>
                        updatePricing(
                          "tierPerKg",
                          parseFloat(e.target.value) || 0,
                        )
                      }
                      className="h-8 w-20 font-mono"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Recargo permiso
                  </Label>
                  <div className="flex items-center gap-1">
                    <span className="text-sm">+$</span>
                    <Input
                      type="number"
                      value={pricing.restrictedSurcharge}
                      onChange={(e) =>
                        updatePricing(
                          "restrictedSurcharge",
                          parseFloat(e.target.value) || 0,
                        )
                      }
                      className="h-8 w-20 font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Fracción &lt;500g
                  </Label>
                  <div className="flex items-center gap-1">
                    <span className="text-sm">$</span>
                    <Input
                      type="number"
                      value={pricing.fractionSmall}
                      onChange={(e) =>
                        updatePricing(
                          "fractionSmall",
                          parseFloat(e.target.value) || 0,
                        )
                      }
                      className="h-8 w-20 font-mono"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Fracción ≥500g
                  </Label>
                  <div className="flex items-center gap-1">
                    <span className="text-sm">$</span>
                    <Input
                      type="number"
                      value={pricing.fractionLarge}
                      onChange={(e) =>
                        updatePricing(
                          "fractionLarge",
                          parseFloat(e.target.value) || 0,
                        )
                      }
                      className="h-8 w-20 font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Examples */}
          <Card className="p-4">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <Info className="h-4 w-4 text-blue-500" />
              Ejemplos de Cálculo
            </h3>

            <div className="grid grid-cols-3 gap-2 text-sm">
              {[0.23, 0.89, 1.3, 2.12, 2.56, 3.5].map((weight) => (
                <div
                  key={weight}
                  className="p-2 rounded bg-muted/50 text-center"
                >
                  <div className="text-xs text-muted-foreground">
                    {weight}kg
                  </div>
                  <div className="font-semibold text-green-600 dark:text-green-400">
                    ${calculateExample(weight)}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 p-2 rounded bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-800 dark:text-amber-200">
              <strong>Fórmula &gt;1kg:</strong> $12 (1kg) + $12 (cada kg) +
              fracción
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

export default PricingManagementNew;
