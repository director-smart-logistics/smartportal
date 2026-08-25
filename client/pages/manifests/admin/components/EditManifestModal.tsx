import { useState } from 'react';
import { Pencil, RefreshCw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase/config';
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  updateDoc,
  query,
  where,
  collection,
  writeBatch,
} from 'firebase/firestore';
import { logAction } from '@/lib/services/audit-service';
import { MANIFEST_TYPES } from '../constants';
import { type ManifestRecord } from '@/lib/services/manifest-processor';

interface EditManifestModalProps {
  manifest: ManifestRecord;
  onClose: () => void;
  onSaved: () => void;
  user: any;
}

/**
 * EditManifestModal Component
 * Allows editing manifest details (Type, Price, Exchange Rate) or renaming the manifest.
 * Renaming a manifest recreates the document under a new Firestore ID and updates references
 * on associated packages and invoices.
 */
export function EditManifestModal({
  manifest,
  onClose,
  onSaved,
  user,
}: EditManifestModalProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  // Form states initialized from manifest record
  const [manifestNumber, setManifestNumber] = useState(manifest.id);
  const [manifestType, setManifestType] = useState(manifest.manifestType);
  const [totalPrice, setTotalPrice] = useState(manifest.totalPrice);
  const [exchangeRate, setExchangeRate] = useState(manifest.exchangeRate || 0);

  const handleSave = async () => {
    if (!manifestNumber.trim()) {
      toast({
        title: 'Error de validación',
        description: 'El número de manifiesto no puede estar vacío.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    const oldId = manifest.id;
    const newId = manifestNumber.trim();
    const now = new Date().toISOString();

    const fieldsToUpdate = {
      manifestType,
      totalPrice: Number(totalPrice),
      exchangeRate: exchangeRate > 0 ? Number(exchangeRate) : null,
      updatedAt: now,
    };

    try {
      if (oldId === newId) {
        // 1. Simple update when manifest number remains the same
        const manifestRef = doc(db, 'manifests', oldId);
        await updateDoc(manifestRef, fieldsToUpdate);
      } else {
        // 2. Document ID change: Read, recreate, and delete the old document
        const sourceRef = doc(db, 'manifests', oldId);
        const destRef = doc(db, 'manifests', newId);

        const srcSnap = await getDoc(sourceRef);
        if (!srcSnap.exists()) {
          throw new Error('El manifiesto original ya no existe.');
        }

        // Check if destination ID is already in use
        const destSnap = await getDoc(destRef);
        if (destSnap.exists()) {
          throw new Error(`Ya existe un manifiesto con el número "${newId}".`);
        }

        const srcData = srcSnap.data();
        const mergedData = {
          ...srcData,
          ...fieldsToUpdate,
          manifestNumber: newId,
        };

        // Create new document & delete old
        await setDoc(destRef, mergedData);
        await deleteDoc(sourceRef);

        // Also check if there's a draft sheet in manifest_usa_sea or manifest_col_air and rename it
        if (manifestType === 'usa_sea') {
          const seaSheetRef = doc(db, 'manifest_usa_sea', oldId);
          const seaSheetSnap = await getDoc(seaSheetRef);
          if (seaSheetSnap.exists()) {
            const seaSheetDestRef = doc(db, 'manifest_usa_sea', newId);
            await setDoc(seaSheetDestRef, {
              ...seaSheetSnap.data(),
              manifestName: newId,
              updatedAt: now,
            });
            await deleteDoc(seaSheetRef);
          }
        } else if (manifestType === 'colombia_air') {
          const colSheetRef = doc(db, 'manifest_col_air', oldId);
          const colSheetSnap = await getDoc(colSheetRef);
          if (colSheetSnap.exists()) {
            const colSheetDestRef = doc(db, 'manifest_col_air', newId);
            await setDoc(colSheetDestRef, {
              ...colSheetSnap.data(),
              manifestName: newId,
              updatedAt: now,
            });
            await deleteDoc(colSheetRef);
          }
        }

        // 3. Batch update related package documents
        const pkgsQ = query(collection(db, 'packages'), where('manifestNumber', '==', oldId));
        const pkgsSnap = await getDocs(pkgsQ);
        if (!pkgsSnap.empty) {
          const pkgBatch = writeBatch(db);
          pkgsSnap.docs.forEach((d) => {
            pkgBatch.update(d.ref, {
              manifestNumber: newId,
              manifestId: newId,
              updatedManifest: newId,
              manifestUpdatedAt: now,
            });
          });
          await pkgBatch.commit();
        }

        // 4. Batch update related invoice documents
        const invQ = query(collection(db, 'invoices'), where('manifestNumber', '==', oldId));
        const invSnap = await getDocs(invQ);
        if (!invSnap.empty) {
          const invBatch = writeBatch(db);
          invSnap.docs.forEach((d) => {
            invBatch.update(d.ref, {
              manifestNumber: newId,
              updatedAt: now,
            });
          });
          await invBatch.commit();
        }
      }

      // Log system audit event for traceability
      logAction({
        userId: user?.id || 'system',
        userName: user?.fullName || user?.email || 'System',
        userEmail: user?.email || undefined,
        userRole: user?.role || undefined,
        action: 'system_event',
        category: 'manifest',
        resource: 'manifests',
        resourceId: newId,
        result: 'success',
        metadata: {
          action: 'manifest_updated',
          oldManifestId: oldId,
          newManifestId: newId,
          manifestType,
          totalPrice,
          exchangeRate,
        },
      });

      toast({
        title: 'Manifiesto actualizado',
        description: `Los cambios para el manifiesto ${newId} fueron guardados con éxito.`,
      });
      onSaved();
      onClose();
    } catch (error: any) {
      toast({
        title: 'Error al actualizar manifiesto',
        description: error?.message || 'Hubo un error guardando el manifiesto.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] w-[95vw] sm:max-w-md bg-white border border-border shadow-lg rounded-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground font-bold text-lg">
            <Pencil className="h-5 w-5 text-[hsl(var(--manifest-brand))]" />
            Editar Manifiesto
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Modifica la información básica o cambia el identificador del manifiesto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2.5">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Número de Manifiesto (ID)
            </label>
            <Input
              value={manifestNumber}
              onChange={(e) => setManifestNumber(e.target.value)}
              placeholder="Número de manifiesto"
              disabled={saving}
              className="font-mono text-sm bg-background border border-border focus:ring-2 focus:ring-[hsl(var(--manifest-brand))] outline-none transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Tipo de Manifiesto
            </label>
            <Select value={manifestType} onValueChange={setManifestType} disabled={saving}>
              <SelectTrigger className="bg-background border border-border focus:ring-2 focus:ring-[hsl(var(--manifest-brand))]">
                <SelectValue placeholder="Selecciona un tipo" />
              </SelectTrigger>
              <SelectContent className="bg-white border border-border shadow-md">
                {MANIFEST_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value} className="cursor-pointer hover:bg-accent/40">
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Precio Total ($)
              </label>
              <Input
                type="number"
                step="0.01"
                value={totalPrice}
                onChange={(e) => setTotalPrice(Number(e.target.value))}
                placeholder="0.00"
                disabled={saving}
                className="font-mono text-sm bg-background border border-border focus:ring-2 focus:ring-[hsl(var(--manifest-brand))] outline-none transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Tipo de Cambio (₡)
              </label>
              <Input
                type="number"
                step="0.1"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(Number(e.target.value))}
                placeholder="500.00"
                disabled={saving}
                className="font-mono text-sm bg-background border border-border focus:ring-2 focus:ring-[hsl(var(--manifest-brand))] outline-none transition-all"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 border-t border-border/60 pt-3 mt-2">
          <Button variant="ghost" onClick={onClose} disabled={saving} className="hover:bg-accent/60 text-muted-foreground hover:text-foreground">
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="font-semibold shadow-sm bg-[hsl(var(--manifest-brand))] hover:opacity-90 text-white"
          >
            {saving ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" />
                Guardando...
              </>
            ) : (
              'Guardar Cambios'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
