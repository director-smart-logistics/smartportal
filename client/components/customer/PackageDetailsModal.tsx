import { useLocale } from "@/hooks/useLocale";
import { useTheme } from "@/lib/context/ThemeContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Package as PackageIcon,
  MapPin,
  Truck,
  Calendar,
  Weight,
  DollarSign,
  ExternalLink,
  X,
} from "lucide-react";
import type { Package } from "@/types";
import { cn } from "@/lib/utils";

interface PackageDetailsModalProps {
  package: Package | null;
  isOpen: boolean;
  onClose: () => void;
  onViewFullDetails?: (packageId: string) => void;
}

export function PackageDetailsModal({
  package: pkg,
  isOpen,
  onClose,
  onViewFullDetails,
}: PackageDetailsModalProps) {
  const { t } = useLocale(["packages", "common"]);
  const { theme } = useTheme();
  const isDark = theme === "dark";

  if (!pkg) return null;

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "delivered":
        return "default";
      case "in_transit":
        return "secondary";
      case "pending":
        return "outline";
      default:
        return "secondary";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "pending":
        return t("packages.statusPending");
      case "in_transit":
        return t("packages.statusInTransit");
      case "delivered":
        return t("packages.statusDelivered");
      case "consolidated":
      case "consolidated_completed":
        return t("packages.statusConsolidated");
      default:
        return status;
    }
  };

  const InfoRow = ({
    icon: Icon,
    label,
    value,
  }: {
    icon: any;
    label: string;
    value: string | number | null | undefined;
  }) => {
    if (!value) return null;

    return (
      <div className="flex items-start gap-3 py-2">
        <Icon
          className={cn(
            "h-5 w-5 flex-shrink-0 mt-0.5",
            isDark ? "text-gray-400" : "text-gray-600",
          )}
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              "text-xs mb-0.5",
              isDark ? "text-gray-400" : "text-gray-500",
            )}
          >
            {label}
          </p>
          <p className={cn("text-sm", isDark ? "text-white" : "text-gray-900")}>
            {value}
          </p>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className={cn(
          "max-w-2xl max-h-[90vh] overflow-y-auto",
          isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200",
        )}
        data-testid="package-details-modal"
      >
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <DialogTitle
                className={cn(
                  "text-2xl font-bold mb-2",
                  isDark ? "text-white" : "text-gray-900",
                )}
              >
                {pkg.trackingNumber}
              </DialogTitle>
              <Badge variant={getStatusBadgeVariant(pkg.status)}>
                {getStatusLabel(pkg.status)}
              </Badge>
            </div>
            <button
              onClick={onClose}
              className={cn(
                "rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100",
                isDark
                  ? "text-gray-400 hover:text-white"
                  : "text-gray-600 hover:text-gray-900",
              )}
              data-testid="btn-close-modal"
            >
              <X className="h-5 w-5" />
              <span className="sr-only">{t("common.close")}</span>
            </button>
          </div>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Location Information */}
          <div>
            <h3
              className={cn(
                "text-sm font-semibold mb-3 flex items-center gap-2",
                isDark ? "text-white" : "text-gray-900",
              )}
            >
              <MapPin className="h-4 w-4" />
              {t("packages.locationInfo")}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InfoRow
                icon={MapPin}
                label={t("packages.origin")}
                value={pkg.origin}
              />
              <InfoRow
                icon={MapPin}
                label={t("packages.destination")}
                value={pkg.destination}
              />
            </div>
          </div>

          {/* Package Details */}
          <div>
            <h3
              className={cn(
                "text-sm font-semibold mb-3 flex items-center gap-2",
                isDark ? "text-white" : "text-gray-900",
              )}
            >
              <PackageIcon className="h-4 w-4" />
              {t("packages.packageDetails")}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InfoRow
                icon={Weight}
                label={t("packages.weight")}
                value={pkg.weight ? `${pkg.weight} kg` : undefined}
              />
              <InfoRow
                icon={DollarSign}
                label={t("packages.cost")}
                value={
                  pkg.calculatedCost
                    ? new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: "USD",
                      }).format(pkg.calculatedCost)
                    : undefined
                }
              />
              {pkg.route && (
                <InfoRow
                  icon={Truck}
                  label={t("packages.route")}
                  value={pkg.route.name}
                />
              )}
              {pkg.customerName && (
                <InfoRow
                  icon={PackageIcon}
                  label={t("packages.customer")}
                  value={pkg.customerName}
                />
              )}
            </div>
          </div>

          {/* Dates */}
          <div>
            <h3
              className={cn(
                "text-sm font-semibold mb-3 flex items-center gap-2",
                isDark ? "text-white" : "text-gray-900",
              )}
            >
              <Calendar className="h-4 w-4" />
              {t("packages.dates")}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InfoRow
                icon={Calendar}
                label={t("common.createdAt")}
                value={new Date(pkg.createdAt).toLocaleDateString()}
              />
              {pkg.updatedAt && (
                <InfoRow
                  icon={Calendar}
                  label={t("packages.updatedAt")}
                  value={new Date(pkg.updatedAt).toLocaleDateString()}
                />
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
            <Button
              onClick={() => onViewFullDetails?.(pkg.id)}
              className="flex-1"
              data-testid="btn-view-full-details"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              {t("packages.viewFullDetails")}
            </Button>
            <Button onClick={onClose} variant="outline" data-testid="btn-close">
              {t("common.close")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
