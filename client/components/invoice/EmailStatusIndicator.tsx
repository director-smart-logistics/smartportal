import React from "react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Mail,
  MailCheck,
  MailOpen,
  MailWarning,
  MailX,
  Clock,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export type EmailStatus =
  | "not_sent"
  | "sent"
  | "delivered"
  | "opened"
  | "bounced"
  | "failed";

interface EmailStatusIndicatorProps {
  status: EmailStatus;
  sentAt?: string;
  deliveredAt?: string;
  openedAt?: string;
  messageId?: string;
  className?: string;
  showLabel?: boolean;
  showTimestamp?: boolean;
  size?: "sm" | "md" | "lg";
}

const STATUS_CONFIG: Record<
  EmailStatus,
  {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    color: string;
    bgColor: string;
    borderColor: string;
    description: string;
  }
> = {
  not_sent: {
    icon: Mail,
    label: "No enviado",
    color: "text-gray-600",
    bgColor: "bg-gray-50",
    borderColor: "border-gray-200",
    description: "El correo aún no ha sido enviado",
  },
  sent: {
    icon: MailCheck,
    label: "Enviado",
    color: "text-cyan-600",
    bgColor: "bg-cyan-50",
    borderColor: "border-cyan-200",
    description: "El correo fue enviado exitosamente",
  },
  delivered: {
    icon: MailCheck,
    label: "Entregado",
    color: "text-green-600",
    bgColor: "bg-green-50",
    borderColor: "border-green-200",
    description: "El correo fue entregado al destinatario",
  },
  opened: {
    icon: MailOpen,
    label: "Abierto",
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    description: "El destinatario abrió el correo",
  },
  bounced: {
    icon: MailWarning,
    label: "Rebotado",
    color: "text-orange-600",
    bgColor: "bg-orange-50",
    borderColor: "border-orange-200",
    description: "El correo rebotó - dirección inválida o buzón lleno",
  },
  failed: {
    icon: MailX,
    label: "Fallido",
    color: "text-red-600",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
    description: "Error al enviar el correo",
  },
};

const SIZE_CONFIG = {
  sm: {
    icon: "h-3 w-3",
    badge: "text-xs px-2 py-0.5",
    timestamp: "text-[10px]",
  },
  md: {
    icon: "h-4 w-4",
    badge: "text-sm px-2.5 py-1",
    timestamp: "text-xs",
  },
  lg: {
    icon: "h-5 w-5",
    badge: "text-base px-3 py-1.5",
    timestamp: "text-sm",
  },
};

export function EmailStatusIndicator({
  status,
  sentAt,
  deliveredAt,
  openedAt,
  messageId,
  className,
  showLabel = true,
  showTimestamp = false,
  size = "md",
}: EmailStatusIndicatorProps) {
  const config = STATUS_CONFIG[status];
  const sizeConfig = SIZE_CONFIG[size];
  const Icon = config.icon;

  // Determine which timestamp to show based on status
  const timestamp = openedAt || deliveredAt || sentAt;
  const timestampLabel = openedAt
    ? "Abierto"
    : deliveredAt
      ? "Entregado"
      : sentAt
        ? "Enviado"
        : null;

  const tooltipContent = (
    <div className="space-y-2">
      <p className="font-semibold">{config.label}</p>
      <p className="text-xs">{config.description}</p>
      {timestamp && (
        <div className="pt-2 border-t border-border/50">
          <p className="text-xs">
            <span className="font-medium">{timestampLabel}:</span>{" "}
            {format(new Date(timestamp), "PPp", { locale: es })}
          </p>
        </div>
      )}
      {messageId && (
        <div className="pt-1">
          <p className="text-[10px] text-muted-foreground font-mono truncate">
            ID: {messageId.substring(0, 20)}...
          </p>
        </div>
      )}
    </div>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn("inline-flex items-center gap-1.5", className)}>
            <Badge
              variant="outline"
              className={cn(
                "inline-flex items-center gap-1.5 font-medium transition-all",
                config.color,
                config.bgColor,
                config.borderColor,
                sizeConfig.badge,
              )}
            >
              <Icon className={sizeConfig.icon} />
              {showLabel && <span>{config.label}</span>}
            </Badge>
            {showTimestamp && timestamp && (
              <span
                className={cn("text-muted-foreground", sizeConfig.timestamp)}
              >
                {format(new Date(timestamp), "PP", { locale: es })}
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Email status timeline component
 * Shows the progression of email delivery
 */
interface EmailStatusTimelineProps {
  sentAt?: string;
  deliveredAt?: string;
  openedAt?: string;
  bouncedAt?: string;
  failedAt?: string;
  className?: string;
}

export function EmailStatusTimeline({
  sentAt,
  deliveredAt,
  openedAt,
  bouncedAt,
  failedAt,
  className,
}: EmailStatusTimelineProps) {
  const steps = [
    {
      label: "Enviado",
      timestamp: sentAt,
      icon: MailCheck,
      active: !!sentAt,
      color: "text-cyan-600",
    },
    {
      label: "Entregado",
      timestamp: deliveredAt,
      icon: MailCheck,
      active: !!deliveredAt,
      color: "text-green-600",
    },
    {
      label: "Abierto",
      timestamp: openedAt,
      icon: MailOpen,
      active: !!openedAt,
      color: "text-blue-600",
    },
  ];

  // If bounced or failed, show error state
  if (bouncedAt || failedAt) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200",
          className,
        )}
      >
        <MailWarning className="h-5 w-5 text-red-600" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-red-900">
            {bouncedAt ? "Correo rebotado" : "Error al enviar"}
          </p>
          <p className="text-xs text-red-700">
            {format(new Date(bouncedAt || failedAt!), "PPp", { locale: es })}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {steps.map((step, index) => {
        const Icon = step.icon;
        const isLast = index === steps.length - 1;

        return (
          <React.Fragment key={step.label}>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg border transition-all",
                      step.active
                        ? `${step.color} bg-opacity-10 border-current`
                        : "text-gray-400 bg-gray-50 border-gray-200",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-xs font-medium">{step.label}</span>
                  </div>
                </TooltipTrigger>
                {step.timestamp && (
                  <TooltipContent>
                    <p className="text-xs">
                      {format(new Date(step.timestamp), "PPp", { locale: es })}
                    </p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
            {!isLast && (
              <div
                className={cn(
                  "h-0.5 w-8 transition-all",
                  step.active && steps[index + 1]?.active
                    ? "bg-green-400"
                    : "bg-gray-200",
                )}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/**
 * Compact email status icon (for table cells)
 */
interface EmailStatusIconProps {
  status: EmailStatus;
  className?: string;
}

export function EmailStatusIcon({ status, className }: EmailStatusIconProps) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "inline-flex items-center justify-center w-6 h-6 rounded-full transition-all",
              config.bgColor,
              config.borderColor,
              "border",
              className,
            )}
            aria-label={config.label}
          >
            <Icon className={cn("h-3.5 w-3.5", config.color)} />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs font-medium">{config.label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Email status with Resend dashboard link
 */
interface EmailStatusWithLinkProps {
  status: EmailStatus;
  messageId?: string;
  sentAt?: string;
  className?: string;
}

export function EmailStatusWithLink({
  status,
  messageId,
  sentAt,
  className,
}: EmailStatusWithLinkProps) {
  const resendDashboardUrl = messageId
    ? `https://resend.com/emails/${messageId}`
    : null;

  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <EmailStatusIndicator status={status} sentAt={sentAt} size="sm" />
      {resendDashboardUrl && (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={resendDashboardUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Ver en Resend"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">Ver en panel de Resend</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
