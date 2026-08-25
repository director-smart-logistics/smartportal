import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLocale } from "@/hooks/useLocale";
import { useTheme } from "@/lib/context/ThemeContext";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  User,
  Mail,
  Phone,
  MapPin,
  Building2,
  CreditCard,
  Hash,
  Truck,
  Calendar,
  Globe,
  Copy,
  Check,
  ExternalLink,
} from "lucide-react";
import type { Customer } from "@/types";
import { copyToClipboard, formatRelativeTime } from "@/lib/utils/customerStats";
import { cn } from "@/lib/utils";

interface CustomerInfoGridProps {
  customer: Customer;
  className?: string;
}

export function CustomerInfoGrid({
  customer,
  className,
}: CustomerInfoGridProps) {
  const { t } = useLocale(["customers", "common"]);
  const { theme } = useTheme();
  const { toast } = useToast();
  const navigate = useNavigate();
  const isDark = theme === "dark";

  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCopy = async (text: string, fieldName: string) => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopiedField(fieldName);
      toast({
        title: t("customers.detailsPage.info.copied"),
        description: `${fieldName} copied to clipboard`,
      });
      setTimeout(() => setCopiedField(null), 2000);
    }
  };

  const InfoField = ({
    icon: Icon,
    label,
    value,
    href,
    copyable,
    fieldName,
    testId,
  }: {
    icon: any;
    label: string;
    value: string | null | undefined;
    href?: string;
    copyable?: boolean;
    fieldName?: string;
    testId?: string;
  }) => {
    if (!value) return null;

    return (
      <div className="flex items-start gap-3" data-testid={testId}>
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
              "text-xs mb-1",
              isDark ? "text-gray-400" : "text-gray-500",
            )}
          >
            {label}
          </p>
          <div className="flex items-center gap-2">
            {href ? (
              <a
                href={href}
                className={cn(
                  "hover:underline break-words",
                  isDark ? "text-blue-400" : "text-blue-600",
                )}
                target={href.startsWith("http") ? "_blank" : undefined}
                rel={
                  href.startsWith("http") ? "noopener noreferrer" : undefined
                }
              >
                {value}
              </a>
            ) : (
              <p
                className={cn(
                  "break-words",
                  isDark ? "text-white" : "text-gray-900",
                )}
              >
                {value}
              </p>
            )}
            {copyable && fieldName && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => handleCopy(value, fieldName)}
                aria-label={`Copy ${fieldName}`}
                data-testid={`btn-copy-${testId}`}
              >
                {copiedField === fieldName ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={cn("space-y-6", className)}>
      {/* Personal Information */}
      <Card
        className={cn(
          "p-6",
          isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200",
        )}
        data-testid="card-personal-info"
      >
        <h3
          className={cn(
            "text-lg font-semibold mb-4 flex items-center gap-2",
            isDark ? "text-white" : "text-gray-900",
          )}
        >
          <User className="h-5 w-5" aria-hidden="true" />
          {t("customers.detailsPage.info.personalInfo")}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InfoField
            icon={User}
            label={t("customers.fullName")}
            value={customer.fullName}
            testId="field-full-name"
          />
          {customer.firstName && (
            <InfoField
              icon={User}
              label={t("customers.firstName")}
              value={customer.firstName}
              testId="field-first-name"
            />
          )}
          {customer.lastName && (
            <InfoField
              icon={User}
              label={t("customers.lastName")}
              value={customer.lastName}
              testId="field-last-name"
            />
          )}
          {customer.dni && (
            <InfoField
              icon={Hash}
              label={t("customers.dni")}
              value={customer.dni}
              copyable
              fieldName="ID Number"
              testId="field-id-number"
            />
          )}
          {customer.slCode && (
            <InfoField
              icon={CreditCard}
              label={t("customers.slCode")}
              value={customer.slCode}
              copyable
              fieldName="SL Account Code"
              testId="field-sl-code"
            />
          )}
          {customer.birthDate && (
            <InfoField
              icon={Calendar}
              label="Fecha de nacimiento"
              value={customer.birthDate}
              testId="field-birth-date"
            />
          )}
          {customer.nationality && (
            <InfoField
              icon={Globe}
              label="Nacionalidad"
              value={customer.nationality}
              testId="field-nationality"
            />
          )}
        </div>
      </Card>

      {/* Contact Information */}
      <Card
        className={cn(
          "p-6",
          isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200",
        )}
        data-testid="card-contact-info"
      >
        <h3
          className={cn(
            "text-lg font-semibold mb-4 flex items-center gap-2",
            isDark ? "text-white" : "text-gray-900",
          )}
        >
          <Mail className="h-5 w-5" aria-hidden="true" />
          {t("customers.detailsPage.info.contactInfo")}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InfoField
            icon={Mail}
            label={t("common.email")}
            value={customer.email}
            href={`mailto:${customer.email}`}
            testId="field-email"
          />
          {customer.phone && (
            <InfoField
              icon={Phone}
              label={t("common.phone")}
              value={customer.phone}
              href={`tel:${customer.phone}`}
              testId="field-phone"
            />
          )}
          {customer.address && (
            <InfoField
              icon={MapPin}
              label={t("common.address")}
              value={customer.address}
              testId="field-address"
            />
          )}
          {customer.city && (
            <InfoField
              icon={Building2}
              label={t("profile.city")}
              value={`${customer.city}${customer.country ? `, ${customer.country}` : ""}`}
              testId="field-city"
            />
          )}
          {customer.zipCode && (
            <InfoField
              icon={MapPin}
              label={t("customers.zipCode")}
              value={customer.zipCode}
              testId="field-zip-code"
            />
          )}
        </div>
      </Card>

      {/* Route Preference */}
      {(customer.preferredRouteId || customer.preferredRoute) && (
        <Card
          className={cn(
            "p-6",
            isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200",
          )}
          data-testid="card-route-preference"
        >
          <h3
            className={cn(
              "text-lg font-semibold mb-4 flex items-center gap-2",
              isDark ? "text-white" : "text-gray-900",
            )}
          >
            <Truck className="h-5 w-5" aria-hidden="true" />
            {t("customers.detailsPage.info.routePreference")}
          </h3>
          <div className="space-y-4">
            {customer.preferredRoute ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Truck
                    className={cn(
                      "h-5 w-5",
                      isDark ? "text-gray-400" : "text-gray-600",
                    )}
                    aria-hidden="true"
                  />
                  <div>
                    <p
                      className={cn(
                        "font-medium",
                        isDark ? "text-white" : "text-gray-900",
                      )}
                    >
                      {customer.preferredRoute.name}
                    </p>
                    <Badge
                      variant={
                        customer.preferredRoute.status === "active"
                          ? "default"
                          : "secondary"
                      }
                      className="mt-1"
                    >
                      {customer.preferredRoute.status}
                    </Badge>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    navigate(`/routes/${customer.preferredRoute?.id}`)
                  }
                  data-testid="btn-view-route"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  {t("customers.detailsPage.info.viewRoute")}
                </Button>
              </div>
            ) : (
              <p
                className={cn(
                  "text-sm",
                  isDark ? "text-gray-400" : "text-gray-600",
                )}
              >
                {t("customers.detailsPage.info.noRoute")}
              </p>
            )}
          </div>
        </Card>
      )}

      {/* Delivery Addresses */}
      {(customer.deliveryAddress1 ||
        customer.deliveryAddress2 ||
        customer.deliveryAddress3) && (
        <Card
          className={cn(
            "p-6",
            isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200",
          )}
          data-testid="card-delivery-addresses"
        >
          <h3
            className={cn(
              "text-lg font-semibold mb-4 flex items-center gap-2",
              isDark ? "text-white" : "text-gray-900",
            )}
          >
            <MapPin className="h-5 w-5" aria-hidden="true" />
            {t("customers.detailsPage.info.deliveryAddresses")}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {customer.deliveryAddress1 && (
              <div
                className={cn(
                  "p-4 rounded-lg",
                  isDark ? "bg-gray-700" : "bg-gray-100",
                )}
                data-testid="field-delivery-address-1"
              >
                <p
                  className={cn(
                    "text-xs font-semibold mb-2",
                    isDark ? "text-gray-400" : "text-gray-600",
                  )}
                >
                  {t("customers.deliveryAddress1")}
                </p>
                <p className={isDark ? "text-gray-200" : "text-gray-900"}>
                  {customer.deliveryAddress1}
                </p>
              </div>
            )}
            {customer.deliveryAddress2 && (
              <div
                className={cn(
                  "p-4 rounded-lg",
                  isDark ? "bg-gray-700" : "bg-gray-100",
                )}
                data-testid="field-delivery-address-2"
              >
                <p
                  className={cn(
                    "text-xs font-semibold mb-2",
                    isDark ? "text-gray-400" : "text-gray-600",
                  )}
                >
                  {t("customers.deliveryAddress2")}
                </p>
                <p className={isDark ? "text-gray-200" : "text-gray-900"}>
                  {customer.deliveryAddress2}
                </p>
              </div>
            )}
            {customer.deliveryAddress3 && (
              <div
                className={cn(
                  "p-4 rounded-lg",
                  isDark ? "bg-gray-700" : "bg-gray-100",
                )}
                data-testid="field-delivery-address-3"
              >
                <p
                  className={cn(
                    "text-xs font-semibold mb-2",
                    isDark ? "text-gray-400" : "text-gray-600",
                  )}
                >
                  {t("customers.deliveryAddress3")}
                </p>
                <p className={isDark ? "text-gray-200" : "text-gray-900"}>
                  {customer.deliveryAddress3}
                </p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Metadata */}
      <Card
        className={cn(
          "p-6",
          isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200",
        )}
        data-testid="card-metadata"
      >
        <h3
          className={cn(
            "text-lg font-semibold mb-4 flex items-center gap-2",
            isDark ? "text-white" : "text-gray-900",
          )}
        >
          <Calendar className="h-5 w-5" aria-hidden="true" />
          {t("customers.detailsPage.info.metadata")}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div data-testid="field-created-at">
            <p
              className={cn(
                "text-xs mb-1",
                isDark ? "text-gray-400" : "text-gray-500",
              )}
            >
              {t("customers.createdAt")}
            </p>
            <p className={isDark ? "text-white" : "text-gray-900"}>
              {new Date(customer.createdAt).toLocaleString()}
            </p>
            <p
              className={cn(
                "text-xs mt-1",
                isDark ? "text-gray-400" : "text-gray-500",
              )}
            >
              {formatRelativeTime(customer.createdAt)}
            </p>
          </div>

          {customer.userCreatedBy && (
            <div data-testid="field-created-by">
              <p
                className={cn(
                  "text-xs mb-1",
                  isDark ? "text-gray-400" : "text-gray-500",
                )}
              >
                {t("customers.detailsPage.info.createdBy")}
              </p>
              <p className={isDark ? "text-white" : "text-gray-900"}>
                {customer.userCreatedBy.fullName}
              </p>
              <p
                className={cn(
                  "text-xs mt-1",
                  isDark ? "text-gray-400" : "text-gray-500",
                )}
              >
                {customer.userCreatedBy.email}
              </p>
            </div>
          )}

          {customer.updatedAt && (
            <div data-testid="field-updated-at">
              <p
                className={cn(
                  "text-xs mb-1",
                  isDark ? "text-gray-400" : "text-gray-500",
                )}
              >
                {t("customers.updatedAt")}
              </p>
              <p className={isDark ? "text-white" : "text-gray-900"}>
                {new Date(customer.updatedAt).toLocaleString()}
              </p>
              <p
                className={cn(
                  "text-xs mt-1",
                  isDark ? "text-gray-400" : "text-gray-500",
                )}
              >
                {formatRelativeTime(customer.updatedAt)}
              </p>
            </div>
          )}

          {customer.userUpdatedBy && (
            <div data-testid="field-updated-by">
              <p
                className={cn(
                  "text-xs mb-1",
                  isDark ? "text-gray-400" : "text-gray-500",
                )}
              >
                {t("customers.detailsPage.info.lastUpdatedBy")}
              </p>
              <p className={isDark ? "text-white" : "text-gray-900"}>
                {customer.userUpdatedBy.fullName}
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* Notes */}
      {customer.notes && (
        <Card
          className={cn(
            "p-6",
            isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200",
          )}
          data-testid="card-notes"
        >
          <h3
            className={cn(
              "text-lg font-semibold mb-4",
              isDark ? "text-white" : "text-gray-900",
            )}
          >
            {t("customers.notes")}
          </h3>
          <p
            className={cn(
              "whitespace-pre-wrap",
              isDark ? "text-gray-300" : "text-gray-700",
            )}
          >
            {customer.notes}
          </p>
        </Card>
      )}
    </div>
  );
}
