import React, { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Mail,
  Send,
  Loader2,
  AlertCircle,
  CheckCircle,
  FileText,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/hooks/useLocale";
import { EmailStatusIndicator } from "./EmailStatusIndicator";

interface SendEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: {
    id: string;
    invoiceNumber: string;
    clientName?: string;
    clientEmail?: string;
    customer?: {
      fullName?: string;
      email?: string;
    };
    totalAmount: number;
    currency?: string;
    emailSent?: boolean;
    emailSentAt?: string;
    emailStatus?: string;
  };
  onConfirm: (data: {
    recipientEmail: string;
    recipientName?: string;
    customMessage?: string;
  }) => Promise<void>;
  isLoading?: boolean;
}

export function SendEmailDialog({
  open,
  onOpenChange,
  invoice,
  onConfirm,
  isLoading = false,
}: SendEmailDialogProps) {
  const { t } = useLocale(["invoices", "common"]);

  const defaultEmail = invoice.clientEmail || invoice.customer?.email || "";
  const defaultName = invoice.clientName || invoice.customer?.fullName || "";

  const [recipientEmail, setRecipientEmail] = useState(defaultEmail);
  const [recipientName, setRecipientName] = useState(defaultName);
  const [customMessage, setCustomMessage] = useState("");
  const [emailError, setEmailError] = useState("");

  const isResend = invoice.emailSent === true;

  // Validate email
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleEmailChange = (value: string) => {
    setRecipientEmail(value);
    if (value && !validateEmail(value)) {
      setEmailError(t("invoices.createCustomer.emailInvalid"));
    } else {
      setEmailError("");
    }
  };

  const handleConfirm = async () => {
    if (!recipientEmail) {
      setEmailError(t("invoices.createCustomer.emailRequired"));
      return;
    }

    if (!validateEmail(recipientEmail)) {
      setEmailError(t("invoices.createCustomer.emailInvalid"));
      return;
    }

    await onConfirm({
      recipientEmail,
      recipientName: recipientName || undefined,
      customMessage: customMessage || undefined,
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            {isResend
              ? t("invoices.email.resend")
              : t("invoices.email.sendInvoice")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isResend
              ? t("invoices.email.confirmResendMessage", {
                  date: invoice.emailSentAt
                    ? new Date(invoice.emailSentAt).toLocaleDateString()
                    : "",
                })
              : t("invoices.email.confirmSendMessage", {
                  invoiceNumber: invoice.invoiceNumber,
                  email: recipientEmail || defaultEmail,
                })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-4">
          {/* Invoice Summary */}
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">
                  {invoice.invoiceNumber}
                </span>
              </div>
              <Badge variant="outline" className="font-mono">
                {invoice.currency || "USD"} ${invoice.totalAmount.toFixed(2)}
              </Badge>
            </div>

            {invoice.emailStatus && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  Estado actual:
                </span>
                <EmailStatusIndicator
                  status={invoice.emailStatus as any}
                  sentAt={invoice.emailSentAt}
                  size="sm"
                />
              </div>
            )}
          </div>

          <Separator />

          {/* Recipient Information */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label
                htmlFor="recipient-name"
                className="flex items-center gap-2"
              >
                <User className="h-4 w-4" />
                {t("invoices.createCustomer.fullName")}
              </Label>
              <Input
                id="recipient-name"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder={t("invoices.createCustomer.fullNamePlaceholder")}
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="recipient-email"
                className="flex items-center gap-2"
              >
                <Mail className="h-4 w-4" />
                {t("invoices.email.recipientEmail")}
                <span className="text-red-500">*</span>
              </Label>
              <Input
                id="recipient-email"
                type="email"
                value={recipientEmail}
                onChange={(e) => handleEmailChange(e.target.value)}
                placeholder={t("invoices.createCustomer.emailPlaceholder")}
                disabled={isLoading}
                className={cn(emailError && "border-red-500")}
                required
              />
              {emailError && (
                <div className="flex items-center gap-1.5 text-xs text-red-600">
                  <AlertCircle className="h-3 w-3" />
                  <span>{emailError}</span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="custom-message">
                Mensaje personalizado (opcional)
              </Label>
              <Textarea
                id="custom-message"
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="Agregue un mensaje personalizado para el cliente..."
                rows={3}
                disabled={isLoading}
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground">
                {customMessage.length}/500 caracteres
              </p>
            </div>
          </div>

          {/* Warning for resend */}
          {isResend && (
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-orange-600 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-orange-900">
                <p className="font-semibold mb-1">Reenvío de factura</p>
                <p>
                  Esta factura ya fue enviada anteriormente. El destinatario
                  recibirá una nueva copia del correo.
                </p>
              </div>
            </div>
          )}

          {/* Success info */}
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 flex items-start gap-2">
            <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-green-900">
              <p className="font-semibold mb-1">Seguimiento automático</p>
              <p>
                El estado del correo se actualizará automáticamente cuando sea
                entregado y abierto por el destinatario.
              </p>
            </div>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>
            {t("common.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isLoading || !!emailError || !recipientEmail}
            className="gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("invoices.email.sendingInvoice")}
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                {isResend
                  ? t("invoices.email.resend")
                  : t("invoices.email.sendInvoice")}
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Bulk send email dialog for multiple invoices
 */
interface BulkSendEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    clientEmail?: string;
    customer?: { email?: string };
  }>;
  onConfirm: () => Promise<void>;
  isLoading?: boolean;
  progress?: { done: number; total: number };
}

export function BulkSendEmailDialog({
  open,
  onOpenChange,
  invoices,
  onConfirm,
  isLoading = false,
  progress,
}: BulkSendEmailDialogProps) {
  const { t } = useLocale(["invoices", "common"]);

  const validInvoices = invoices.filter(
    (inv) => inv.clientEmail || inv.customer?.email,
  );
  const invalidCount = invoices.length - validInvoices.length;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Enviar {invoices.length} facturas por correo
          </AlertDialogTitle>
          <AlertDialogDescription>
            Se enviarán correos electrónicos a los clientes de las facturas
            seleccionadas.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground mb-1">
                Facturas válidas
              </p>
              <p className="text-2xl font-bold text-green-600">
                {validInvoices.length}
              </p>
            </div>
            {invalidCount > 0 && (
              <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
                <p className="text-xs text-orange-700 mb-1">Sin correo</p>
                <p className="text-2xl font-bold text-orange-600">
                  {invalidCount}
                </p>
              </div>
            )}
          </div>

          {progress && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Progreso</span>
                <span className="font-medium">
                  {progress.done} / {progress.total}
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{
                    width: `${(progress.done / progress.total) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}

          {invalidCount > 0 && (
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-orange-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-orange-900">
                {invalidCount} factura(s) no tienen correo electrónico
                configurado y serán omitidas.
              </p>
            </div>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>
            {t("common.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isLoading || validInvoices.length === 0}
            className="gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Enviar {validInvoices.length} correos
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
