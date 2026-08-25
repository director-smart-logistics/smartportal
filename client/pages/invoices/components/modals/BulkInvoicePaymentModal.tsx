import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CreditCard, Banknote, Building2, Smartphone, Loader2, CheckCircle2, ShieldCheck } from 'lucide-react';
import { updateInvoicesPaymentDetails, type InvoicePaymentDetails } from '@/lib/services/invoice-service';
import { useToast } from '@/hooks/use-toast';

interface BulkInvoicePaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedInvoiceIds: string[];
  onSuccess: () => void;
}

export const BulkInvoicePaymentModal: React.FC<BulkInvoicePaymentModalProps> = ({
  open,
  onOpenChange,
  selectedInvoiceIds,
  onSuccess,
}) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  // Default payment method: SINPE (06)
  const [medioPago, setMedioPago] = useState<'01' | '03' | '06' | '02'>('06');
  // Default condition of sale: Contado (01)
  const [condicionVenta, setCondicionVenta] = useState<'01' | '02'>('01');
  // Document type: Auto detect (FE "01" vs TE "04")
  const [tipoDocumento, setTipoDocumento] = useState<'auto' | '01' | '04'>('auto');

  const handleApply = async () => {
    if (!selectedInvoiceIds.length) return;
    setLoading(true);
    try {
      const metodoLabelMap: Record<string, string> = {
        '01': 'efectivo',
        '03': 'transferencia',
        '06': 'sinpe',
        '02': 'tarjeta',
      };

      const paymentDetails: InvoicePaymentDetails = {
        medioPagoCode: medioPago,
        condicionVentaCode: condicionVenta,
        metodoPago: metodoLabelMap[medioPago] || 'sinpe',
        ...(tipoDocumento !== 'auto' ? { tipoDocumentoCode: tipoDocumento } : {}),
      };

      const result = await updateInvoicesPaymentDetails(selectedInvoiceIds, paymentDetails);

      toast({
        title: 'Actualización exitosa',
        description: `Se actualizaron los datos fiscales de ${result.count} factura(s).`,
      });

      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: 'Error al actualizar facturas',
        description: err.message || 'Ocurrió un error inesperado al actualizar las facturas.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-6 bg-background rounded-xl shadow-2xl border border-border">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-2 text-primary font-bold text-lg">
            <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <DialogTitle>Actualización Masiva de Facturas</DialogTitle>
          </div>
          <DialogDescription className="text-sm text-muted-foreground">
            Asigna el medio de pago, condición de venta y tipo de documento para{' '}
            <strong className="text-foreground font-semibold">{selectedInvoiceIds.length}</strong> factura(s) seleccionada(s).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-3">
          {/* Medio de Pago */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Medio de Pago (Hacienda CR)
            </Label>
            <RadioGroup
              value={medioPago}
              onValueChange={(val) => setMedioPago(val as any)}
              className="grid grid-cols-1 gap-2"
            >
              <div
                className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                  medioPago === '06' ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:bg-accent'
                }`}
                onClick={() => setMedioPago('06')}
              >
                <div className="flex items-center gap-3">
                  <RadioGroupItem value="06" id="mp-06" />
                  <div className="flex items-center gap-2 font-medium text-sm">
                    <Smartphone className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>06: SINPE / SINPE Móvil</span>
                  </div>
                </div>
              </div>

              <div
                className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                  medioPago === '03' ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:bg-accent'
                }`}
                onClick={() => setMedioPago('03')}
              >
                <div className="flex items-center gap-3">
                  <RadioGroupItem value="03" id="mp-03" />
                  <div className="flex items-center gap-2 font-medium text-sm">
                    <Building2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>03: Transferencia Bancaria</span>
                  </div>
                </div>
              </div>

              <div
                className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                  medioPago === '01' ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:bg-accent'
                }`}
                onClick={() => setMedioPago('01')}
              >
                <div className="flex items-center gap-3">
                  <RadioGroupItem value="01" id="mp-01" />
                  <div className="flex items-center gap-2 font-medium text-sm">
                    <Banknote className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <span>01: Efectivo</span>
                  </div>
                </div>
              </div>
            </RadioGroup>
          </div>

          {/* Condición de Venta */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Condición de Venta
            </Label>
            <RadioGroup
              value={condicionVenta}
              onValueChange={(val) => setCondicionVenta(val as any)}
              className="grid grid-cols-2 gap-2"
            >
              <div
                className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer ${
                  condicionVenta === '01' ? 'border-primary bg-primary/5 font-semibold' : 'border-border'
                }`}
                onClick={() => setCondicionVenta('01')}
              >
                <RadioGroupItem value="01" id="cv-01" />
                <span className="text-xs">01: Contado</span>
              </div>
              <div
                className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer ${
                  condicionVenta === '02' ? 'border-primary bg-primary/5 font-semibold' : 'border-border'
                }`}
                onClick={() => setCondicionVenta('02')}
              >
                <RadioGroupItem value="02" id="cv-02" />
                <span className="text-xs">02: Crédito</span>
              </div>
            </RadioGroup>
          </div>

          {/* Tipo de Documento */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Tipo de Documento
            </Label>
            <Select value={tipoDocumento} onValueChange={(val) => setTipoDocumento(val as any)}>
              <SelectTrigger className="w-full text-xs">
                <SelectValue placeholder="Seleccionar Tipo de Documento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto" className="text-xs">
                  Automático (FE si cliente la requiere, Tiquete por defecto)
                </SelectItem>
                <SelectItem value="01" className="text-xs">
                  01: Factura Electrónica (FE)
                </SelectItem>
                <SelectItem value="04" className="text-xs">
                  04: Tiquete Electrónico (TE)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleApply} disabled={loading} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Aplicar a {selectedInvoiceIds.length} Factura(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
