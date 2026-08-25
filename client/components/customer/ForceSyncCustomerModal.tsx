import { useCallback, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CloudDownload } from 'lucide-react';
import { firebaseApi } from '@/lib/firebase/callable';
import { useToast } from '@/hooks/use-toast';

interface ForceSyncCustomerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSlCode?: string;
  onSuccess?: (slCode: string) => void;
}

export function ForceSyncCustomerModal({
  open,
  onOpenChange,
  initialSlCode = '',
  onSuccess,
}: ForceSyncCustomerModalProps) {
  const { toast } = useToast();
  const [slCode, setSlCode] = useState(() => initialSlCode || '');
  const [submitting, setSubmitting] = useState(false);

  // Update slCode when initialSlCode changes or modal opens
  if (open && (slCode || '') === '' && initialSlCode) {
    setSlCode(initialSlCode);
  }

  const canSubmit = !!(slCode || '').trim() && !submitting;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const codeToSync = (slCode || '').trim().toUpperCase();
      const res = await firebaseApi.customers.forceSyncFromSP2(codeToSync);
      if (!res.success || !res.data?.customer) {
        toast({
          title: 'No se pudo sincronizar',
          description: res.error || 'No se encontró el cliente en SP2 o hubo un error.',
          variant: 'destructive',
        });
        return;
      }
      toast({
        title: 'Cliente recuperado desde SP2',
        description: `${res.data.customer.fullName} (${res.data.customer.slCode}) sincronizado correctamente en SP1.`,
      });
      onSuccess?.(res.data.customer.slCode);
      onOpenChange(false);
    } catch (err) {
      toast({
        title: 'Error al forzar sync',
        description: (err as Error).message,
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, slCode, toast, onSuccess, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CloudDownload className="h-4 w-4 text-primary" aria-hidden />
            Forzar Sincronización desde SP2
          </DialogTitle>
          <DialogDescription className="text-xs">
            Descarga los datos directamente desde SP2 para el SL Code ingresado y crea o actualiza la cuenta en SP1.
            Usar esto si la cuenta existe en SP2 pero no aparece en SP1.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label className="text-xs font-medium">SL Code</Label>
            <Input
              value={slCode}
              onChange={(e) => setSlCode(e.target.value)}
              placeholder="Ej: SL4053"
              className="font-mono"
              disabled={submitting}
              autoFocus
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Sincronizando…</>
            ) : (
              <><CloudDownload className="h-3.5 w-3.5 mr-1.5" /> Forzar Sync</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
