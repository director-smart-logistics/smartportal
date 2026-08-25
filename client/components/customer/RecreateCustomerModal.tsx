/**
 * RecreateCustomerModal
 *
 * Admin tool to manually rebuild a customer record after it was deleted
 * from BOTH SP1 and SP2 but orphan operational data (paquetes, facturas,
 * pre-alertas) is still attached to its slCode.
 *
 * Inputs default-empty so the admin can paste/type the values from
 * whatever backup they have (Excel, WhatsApp, audit log). slCode and
 * email are required because everything downstream keys by those.
 *
 * Validates uniqueness server-side; the modal only enforces the typed
 * confirmation gate and basic shape.
 */
import { useCallback, useEffect, useState } from 'react';
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
import { Loader2, RotateCcw, AlertTriangle } from 'lucide-react';
import { firebaseApi } from '@/lib/firebase/callable';
import { useToast } from '@/hooks/use-toast';

interface RecreateCustomerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional initial values when opened from a context that already
   *  knows part of the customer's identity (e.g. an orphan trace). */
  initial?: Partial<RecreatePayload>;
  onSuccess?: (slCode: string) => void;
}

interface RecreatePayload {
  slCode: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  dni: string;
  ruta: string;
  nationality: string;
  birthDate: string;
  country: string;
  reason: string;
  force: boolean;
}

const EMPTY: RecreatePayload = {
  slCode: '', email: '', firstName: '', lastName: '', phone: '', dni: '',
  ruta: '', nationality: '', birthDate: '', country: 'Costa Rica', reason: '', force: false,
};

function mergeInitial(initial?: Partial<RecreatePayload>): RecreatePayload {
  return {
    slCode: initial?.slCode ?? EMPTY.slCode,
    email: initial?.email ?? EMPTY.email,
    firstName: initial?.firstName ?? EMPTY.firstName,
    lastName: initial?.lastName ?? EMPTY.lastName,
    phone: initial?.phone ?? EMPTY.phone,
    dni: initial?.dni ?? EMPTY.dni,
    ruta: initial?.ruta ?? EMPTY.ruta,
    nationality: initial?.nationality ?? EMPTY.nationality,
    birthDate: initial?.birthDate ?? EMPTY.birthDate,
    country: initial?.country ?? EMPTY.country,
    reason: initial?.reason ?? EMPTY.reason,
    force: initial?.force ?? EMPTY.force,
  };
}

export function RecreateCustomerModal({
  open,
  onOpenChange,
  initial,
  onSuccess,
}: RecreateCustomerModalProps) {
  const { toast } = useToast();
  const [data, setData] = useState<RecreatePayload>(() => mergeInitial(initial));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setData(mergeInitial(initial));
  }, [open, initial]);

  const update = (k: keyof RecreatePayload) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setData(prev => ({ ...prev, [k]: e.target.value }));

  const canSubmit =
    !!data.slCode.trim() &&
    !!data.email.trim() &&
    !!data.firstName.trim() &&
    !submitting;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await firebaseApi.customers.recreate({
        slCode:      data.slCode.trim().toUpperCase(),
        email:       data.email.trim().toLowerCase(),
        firstName:   data.firstName.trim(),
        lastName:    data.lastName.trim(),
        phone:       data.phone.trim()       || undefined,
        dni:         data.dni.trim()         || undefined,
        ruta:        data.ruta.trim()        || undefined,
        nationality: data.nationality.trim() || undefined,
        birthDate:   data.birthDate.trim()   || undefined,
        country:     data.country.trim()     || undefined,
        reason:      data.reason.trim()      || undefined,
        force:       data.force,
      });
      if (!res.success || !res.data) {
        toast({
          title: 'No se pudo recuperar el cliente',
          description: res.error || 'Respuesta vacía del servidor.',
          variant: 'destructive',
        });
        return;
      }
      toast({
        title: 'Cliente recuperado',
        description: `${res.data.customer.fullName} (${res.data.customer.slCode}) creado en SP1.`,
      });
      onSuccess?.(res.data.customer.slCode);
      onOpenChange(false);
    } catch (err) {
      toast({
        title: 'Error al recuperar',
        description: (err as Error).message,
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, data, toast, onSuccess, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-primary" aria-hidden />
            Recuperar cliente eliminado
          </DialogTitle>
          <DialogDescription className="text-xs">
            Recrea el documento <span className="font-mono">customers/{'{slCode}'}</span> a partir de los datos
            que tengas. Útil cuando la cuenta se borró de SP1 y SP2 pero hay paquetes, facturas o pre-alertas
            todavía referenciando el SL Code.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:border-amber-700/50 dark:text-amber-200 flex gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
            <div>
              <p className="font-semibold mb-0.5">No se toca SP2.</p>
              <p>
                Esto solo recrea el doc en SP1 para que los datos asociados vuelvan a tener un propietario
                visible. Si el cliente quiere acceso al portal SP2, debe registrarse de nuevo allá.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="SL Code *" required>
              <Input value={data.slCode} onChange={update('slCode')} placeholder="SL4053" className="font-mono" disabled={submitting} autoFocus />
            </Field>
            <Field label="Correo *" required>
              <Input value={data.email} onChange={update('email')} placeholder="cliente@correo.com" type="email" disabled={submitting} />
            </Field>
            <Field label="Primer nombre *" required>
              <Input value={data.firstName} onChange={update('firstName')} placeholder="Aurelio" disabled={submitting} />
            </Field>
            <Field label="Apellido(s)">
              <Input value={data.lastName} onChange={update('lastName')} placeholder="Vidor Osaba" disabled={submitting} />
            </Field>
            <Field label="Teléfono">
              <Input value={data.phone} onChange={update('phone')} placeholder="+50689274923" disabled={submitting} />
            </Field>
            <Field label="DNI / Cédula">
              <Input value={data.dni} onChange={update('dni')} placeholder="138000040213" className="font-mono" disabled={submitting} />
            </Field>
            <Field label="Ruta">
              <Input value={data.ruta} onChange={update('ruta')} placeholder="Alajuela" disabled={submitting} />
            </Field>
            <Field label="Nacionalidad">
              <Input value={data.nationality} onChange={update('nationality')} placeholder="Costarricense" disabled={submitting} />
            </Field>
            <Field label="Fecha de nacimiento">
              <Input value={data.birthDate} onChange={update('birthDate')} placeholder="07/01/1961" disabled={submitting} />
            </Field>
            <Field label="País">
              <Input value={data.country} onChange={update('country')} disabled={submitting} />
            </Field>
            <div className="col-span-2">
              <Field label="Motivo (queda en el audit log)">
                <Input
                  value={data.reason}
                  onChange={update('reason')}
                  placeholder='Ej: "Eliminado por inactividad — recuperar para resolver paquetes huérfanos"'
                  disabled={submitting}
                />
              </Field>
            </div>
            <div className="col-span-2 flex items-center gap-2 mt-1">
              <input
                type="checkbox"
                id="force-recreate"
                checked={data.force}
                onChange={(e) => setData(prev => ({ ...prev, force: e.target.checked }))}
                disabled={submitting}
                className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4"
              />
              <Label htmlFor="force-recreate" className="text-xs font-medium cursor-pointer">
                Forzar (sobrescribir si ya existe en SP1)
              </Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting
              ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Recuperando…</>
              : <><RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Recrear cliente</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] font-medium">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}
