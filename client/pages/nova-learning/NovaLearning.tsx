/**
 * Nova Learning — Admin CRUD for the two learning collections Nova uses.
 *
 * Collections:
 *  • match_feedback           — Admin/AI confirmed name→slCode pairs (primary source)
 *  • manifest_learning_patterns — ThumbsUp pattern approvals from Nova table
 *
 * Purpose: Let humans clean up bad AI/auto-learned mappings so the next
 * manifest run uses correct data without relying on algorithmic fallback.
 */

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Brain,
  ShieldAlert,
  ListChecks,
  Search,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ThumbsUp,
  ThumbsDown,
  Bot,
  UserCheck,
  Hash,
  Route,
  Boxes,
  Sparkles,
  Database,
  TrendingUp,
  AlertTriangle,
  HelpCircle,
  Plus,
  Minus,
  Pencil,
  X,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  searchMatchFeedbackRecords,
  searchLearningPatternRecords,
  deleteMatchFeedbackBulk,
  deleteLearningPatternBulk,
  checkOrphanLearningRecords,
  deleteMatchFeedback,
  deleteLearningPattern,
  supersedeFeedback,
  promoteFeedbackToAdmin,
  cleanRoutingPrefixLearning,
  hasRoutingPrefix,
  updateMatchFeedback,
  createMatchFeedback,
  type MatchFeedbackRecord,
  type LearningPatternRecord,
} from '@/lib/services/nova-learning-service';
import { updateCustomerRuta, updateCustomerConsolidation } from '@/lib/services/customer-sync';
import { loadCustomers, findCustomerMatch, jaroWinklerSimilarity, type CustomerData } from '@/lib/services/matching';

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(ts?: { seconds?: number; toDate?: () => Date } | Date | null): string {
  if (!ts) return '—';
  try {
    const d = typeof (ts as { toDate: () => Date }).toDate === 'function'
      ? (ts as { toDate: () => Date }).toDate()
      : ts instanceof Date ? ts : new Date((ts as { seconds: number }).seconds * 1000);
    return d.toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '—';
  }
}

function sourceBadge(source: string) {
  switch (source) {
    case 'admin_pick':
    case 'admin_manual':
    case 'admin_sp2':
      return <Badge variant="secondary" className="text-[10px]"><UserCheck className="h-3 w-3 mr-1" /> Admin</Badge>;
    case 'ai_auto':
      return <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-600"><Bot className="h-3 w-3 mr-1" /> AI Auto</Badge>;
    case 'ai_superseded':
      return <Badge variant="outline" className="text-[10px] border-red-300 text-red-600 line-through"><ThumbsDown className="h-3 w-3 mr-1" /> Superseded</Badge>;
    default:
      return <Badge variant="outline" className="text-[10px]">{source}</Badge>;
  }
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function NovaLearning() {
  const { toast } = useToast();

  // Feedback data
  const [feedback, setFeedback] = useState<MatchFeedbackRecord[]>([]);
  const [loadingFeedback, setLoadingFeedback] = useState(true);
  const [searchFeedback, setSearchFeedback] = useState('');
  const [searchCognitive, setSearchCognitive] = useState('');
  const [filterCognitiveUsage, setFilterCognitiveUsage] = useState<string>('all');
  const [filterCognitiveRuta, setFilterCognitiveRuta] = useState<string>('all');
  const [filterCognitiveConsolidation, setFilterCognitiveConsolidation] = useState<string>('all');
  const [refreshKey, setRefreshKey] = useState(0);

  // Patterns data
  const [patterns, setPatterns] = useState<LearningPatternRecord[]>([]);
  const [loadingPatterns, setLoadingPatterns] = useState(true);
  const [searchPatterns, setSearchPatterns] = useState('');

  // Dialogs
  const [deletingFeedback, setDeletingFeedback] = useState<MatchFeedbackRecord | null>(null);
  const [supersedingFeedback, setSupersedingFeedback] = useState<MatchFeedbackRecord | null>(null);
  const [promotingFeedback, setPromotingFeedback] = useState<MatchFeedbackRecord | null>(null);
  const [deletingPattern, setDeletingPattern] = useState<LearningPatternRecord | null>(null);
  const [editingFeedback, setEditingFeedback] = useState<MatchFeedbackRecord | null>(null);
  
  // Edit Form Fields
  const [editManifestName, setEditManifestName] = useState('');
  const [editSlCode, setEditSlCode] = useState('');
  const [editFullName, setEditFullName] = useState('');
  const [editRuta, setEditRuta] = useState('');
  const [editConsolidation, setEditConsolidation] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Selection state
  const [selectedFeedback, setSelectedFeedback] = useState<Set<string>>(new Set());
  const [selectedPatterns, setSelectedPatterns] = useState<Set<string>>(new Set());

  // Additional Filters for Feedback
  const [filterSource, setFilterSource] = useState<string>('all');
  const [filterRuta, setFilterRuta] = useState<string>('all');
  const [filterConsolidation, setFilterConsolidation] = useState<string>('all');

  // Audit state
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditResults, setAuditResults] = useState<Record<string, boolean>>({}); // slCode -> isOrphan (true)
  const [isCleaningPrefixes, setIsCleaningPrefixes] = useState(false);

  // Cognitive learning and predictive pattern states
  const [customers, setCustomers] = useState<CustomerData[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [updatingConsolidation, setUpdatingConsolidation] = useState<Record<string, boolean>>({});
  const [updatingRuta, setUpdatingRuta] = useState<Record<string, boolean>>({});

  // Manual mapping states
  const [manualManifestName, setManualManifestName] = useState('');
  const [searchCustomerQuery, setSearchCustomerQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerData | null>(null);
  const [manualRuta, setManualRuta] = useState('');
  const [manualConsolidation, setManualConsolidation] = useState(false);
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // Match Simulator states
  const [simName, setSimName] = useState('');
  const [simResult, setSimResult] = useState<any>(null);
  const [isSimulating, setIsSimulating] = useState(false);


  useEffect(() => {
    if (!searchCognitive.trim()) return;
    let isCancelled = false;
    async function initCustomers() {
      setLoadingCustomers(true);
      try {
        const list = await loadCustomers();
        if (!isCancelled) {
          setCustomers(list);
        }
      } catch (err) {
        console.error('Error loading customers for cognitive insights:', err);
      } finally {
        if (!isCancelled) {
          setLoadingCustomers(false);
        }
      }
    }
    initCustomers();
    return () => {
      isCancelled = true;
    };
  }, [refreshKey, searchCognitive]);

  useEffect(() => {
    const handleRutaUpdate = (e: Event) => {
      const { slCode, ruta } = (e as CustomEvent).detail;
      setCustomers(prev =>
        prev.map(c => (c.slCode.toUpperCase() === slCode.toUpperCase() ? { ...c, ruta } : c))
      );
      setFeedback(prev =>
        prev.map(f => (f.slCode.toUpperCase() === slCode.toUpperCase() ? { ...f, ruta } : f))
      );
    };

    const handleConsolidationUpdate = (e: Event) => {
      const { slCode, consolidationEnabled } = (e as CustomEvent).detail;
      setCustomers(prev =>
        prev.map(c => (c.slCode.toUpperCase() === slCode.toUpperCase() ? { ...c, consolidationEnabled } : c))
      );
      setFeedback(prev =>
        prev.map(f => (f.slCode.toUpperCase() === slCode.toUpperCase() ? { ...f, consolidationEnabled } : f))
      );
    };

    window.addEventListener('customer-ruta-updated', handleRutaUpdate);
    window.addEventListener('customer-consolidation-updated', handleConsolidationUpdate);

    return () => {
      window.removeEventListener('customer-ruta-updated', handleRutaUpdate);
      window.removeEventListener('customer-consolidation-updated', handleConsolidationUpdate);
    };
  }, []);

  const handleToggleConsolidation = async (slCode: string, currentStatus: boolean) => {
    setUpdatingConsolidation(prev => ({ ...prev, [slCode]: true }));
    const newStatus = !currentStatus;
    try {
      await updateCustomerConsolidation(slCode, newStatus);
      toast({
        title: 'Consolidación actualizada',
        description: `Se ha ${newStatus ? 'habilitado' : 'deshabilitado'} la consolidación para el cliente ${slCode}.`,
      });
    } catch (err) {
      toast({
        title: 'Error al actualizar consolidación',
        description: (err as Error).message,
        variant: 'destructive',
      });
    } finally {
      setUpdatingConsolidation(prev => ({ ...prev, [slCode]: false }));
    }
  };

  const handleAlignCustomerRoute = async (slCode: string, targetRuta: string) => {
    setUpdatingRuta(prev => ({ ...prev, [slCode]: true }));
    try {
      await updateCustomerRuta(slCode, targetRuta, false, 'nova_learning');
      toast({
        title: 'Ruta de cliente actualizada',
        description: `Se alineó la ruta del cliente ${slCode} a "${targetRuta}".`,
      });
    } catch (err) {
      toast({
        title: 'Error al actualizar ruta',
        description: (err as Error).message,
        variant: 'destructive',
      });
    } finally {
      setUpdatingRuta(prev => ({ ...prev, [slCode]: false }));
    }
  };

  const handleAlignRecordRoute = async (recordId: string, slCode: string, targetRuta: string | null) => {
    try {
      await updateMatchFeedback(recordId, { ruta: targetRuta });
      toast({
        title: 'Registro de aprendizaje actualizado',
        description: `Se actualizó la ruta del patrón para el cliente ${slCode} a "${targetRuta || 'Sin Ruta'}".`,
      });
    } catch (err) {
      toast({
        title: 'Error al actualizar registro',
        description: (err as Error).message,
        variant: 'destructive',
      });
    }
  };

  const handleUpdateHits = async (recordId: string, currentHits: number, delta: number) => {
    const newHits = Math.max(0, currentHits + delta);
    try {
      await updateMatchFeedback(recordId, { hitCount: newHits });
    } catch (err) {
      toast({
        title: 'Error al actualizar hits',
        description: (err as Error).message,
        variant: 'destructive',
      });
    }
  };

  const handleOpenEdit = (rec: MatchFeedbackRecord) => {
    setEditingFeedback(rec);
    setEditManifestName(rec.manifestName || '');
    setEditSlCode(rec.slCode || '');
    setEditFullName(rec.fullName || '');
    setEditRuta(rec.ruta || '');
    setEditConsolidation(rec.consolidationEnabled || false);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFeedback) return;
    if (!editManifestName.trim() || !editSlCode.trim() || !editFullName.trim()) {
      toast({
        title: 'Campos obligatorios',
        description: 'Por favor rellena el nombre del manifiesto, slCode y nombre completo.',
        variant: 'destructive',
      });
      return;
    }
    setIsSavingEdit(true);
    try {
      const normalized = editManifestName
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      await updateMatchFeedback(editingFeedback.id, {
        manifestName: editManifestName.trim(),
        normalizedName: normalized,
        slCode: editSlCode.trim().toUpperCase(),
        fullName: editFullName.trim(),
        ruta: editRuta || null,
        consolidationEnabled: editConsolidation,
      });

      toast({
        title: 'Registro actualizado',
        description: `Se guardaron los cambios para "${editManifestName}".`,
      });
      setEditingFeedback(null);
    } catch (err) {
      toast({
        title: 'Error al guardar cambios',
        description: (err as Error).message,
        variant: 'destructive',
      });
    } finally {
      setIsSavingEdit(false);
    }
  };

  const cognitiveData = useMemo(() => {
    const customerMap = new Map<string, {
      slCode: string;
      fullName: string;
      totalHits: number;
      records: MatchFeedbackRecord[];
      manifestNames: Set<string>;
      currentRuta?: string;
      consolidationEnabled: boolean;
      isTemp: boolean;
    }>();

    const customersByCode = new Map<string, CustomerData>();
    customers.forEach(c => {
      customersByCode.set(c.slCode.toUpperCase(), c);
    });

    feedback.forEach(f => {
      const code = f.slCode;
      if (!code) return;
      const upperCode = code.toUpperCase();
      
      const cust = customersByCode.get(upperCode);
      const isTemp = upperCode.startsWith('SL-NAN-');

      if (!customerMap.has(upperCode)) {
        customerMap.set(upperCode, {
          slCode: code,
          fullName: cust?.fullName || f.fullName || 'Cliente desconocido',
          totalHits: 0,
          records: [],
          manifestNames: new Set(),
          currentRuta: cust?.ruta || f.ruta || undefined,
          consolidationEnabled: cust ? cust.consolidationEnabled : !!f.consolidationEnabled,
          isTemp,
        });
      }

      const entry = customerMap.get(upperCode)!;
      entry.totalHits += f.hitCount || 0;
      entry.records.push(f);
      if (f.manifestName) {
        entry.manifestNames.add(f.manifestName);
      }
    });

    const list = Array.from(customerMap.values());
    list.sort((a, b) => b.totalHits - a.totalHits);
    return list;
  }, [feedback, customers]);

  const consolidationRecommendations = useMemo(() => {
    return cognitiveData.filter(d => d.totalHits >= 3 && !d.consolidationEnabled);
  }, [cognitiveData]);

  const routeInconsistencies = useMemo(() => {
    const list: Array<{
      slCode: string;
      fullName: string;
      customerRuta?: string;
      recordRuta?: string;
      recordId: string;
      manifestName: string;
    }> = [];

    cognitiveData.forEach(d => {
      d.records.forEach(r => {
        if (r.ruta && d.currentRuta && r.ruta !== d.currentRuta) {
          list.push({
            slCode: d.slCode,
            fullName: d.fullName,
            customerRuta: d.currentRuta,
            recordRuta: r.ruta,
            recordId: r.id,
            manifestName: r.manifestName,
          });
        }
      });
    });

    return list;
  }, [cognitiveData]);


  // On-demand search for match_feedback (bounded to 50 results)
  useEffect(() => {
    let isCancelled = false;
    setLoadingFeedback(true);
    const timer = setTimeout(async () => {
      try {
        const items = await searchMatchFeedbackRecords({
          query: searchFeedback,
          source: filterSource,
          ruta: filterRuta,
          consolidation: filterConsolidation,
          limitN: 50,
        });
        if (!isCancelled) {
          setFeedback(items);
          setLoadingFeedback(false);
        }
      } catch (err) {
        if (!isCancelled) {
          toast({ title: 'Error buscando match_feedback', description: (err as Error).message, variant: 'destructive' });
          setLoadingFeedback(false);
        }
      }
    }, 250);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [searchFeedback, filterSource, filterRuta, filterConsolidation, refreshKey, toast]);

  // On-demand search for learning_patterns (bounded to 50 results)
  useEffect(() => {
    let isCancelled = false;
    setLoadingPatterns(true);
    const timer = setTimeout(async () => {
      try {
        const items = await searchLearningPatternRecords({
          query: searchPatterns,
          limitN: 50,
        });
        if (!isCancelled) {
          setPatterns(items);
          setLoadingPatterns(false);
        }
      } catch (err) {
        if (!isCancelled) {
          toast({ title: 'Error buscando learning_patterns', description: (err as Error).message, variant: 'destructive' });
          setLoadingPatterns(false);
        }
      }
    }, 250);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [searchPatterns, refreshKey, toast]);

  // Filtered lists (already bounded & filtered from on-demand search)
  const filteredFeedback = feedback;
  const filteredPatterns = patterns;

  const filteredCognitive = useMemo(() => {
    const q = searchCognitive.trim().toLowerCase();
    if (!q) return [];
    
    let list = cognitiveData;
    
    list = list.filter(d =>
      d.slCode.toLowerCase().includes(q) ||
      d.fullName.toLowerCase().includes(q)
    );
    
    if (filterCognitiveUsage !== 'all') {
      list = list.filter(d => {
        if (filterCognitiveUsage === 'vip') return d.totalHits >= 15;
        if (filterCognitiveUsage === 'frequent') return d.totalHits >= 6 && d.totalHits < 15;
        if (filterCognitiveUsage === 'regular') return d.totalHits >= 3 && d.totalHits < 6;
        if (filterCognitiveUsage === 'occasional') return d.totalHits < 3;
        return true;
      });
    }
    
    if (filterCognitiveRuta !== 'all') {
      if (filterCognitiveRuta === 'none') {
        list = list.filter(d => !d.currentRuta);
      } else {
        list = list.filter(d => d.currentRuta === filterCognitiveRuta);
      }
    }
    
    if (filterCognitiveConsolidation !== 'all') {
      const wantCons = filterCognitiveConsolidation === 'yes';
      list = list.filter(d => d.consolidationEnabled === wantCons);
    }
    
    return list;
  }, [cognitiveData, searchCognitive, filterCognitiveUsage, filterCognitiveRuta, filterCognitiveConsolidation]);

  
  const availableRutas = useMemo(() => {
    const defaultRutas = [
      'Alajuela',
      'Cartago 1',
      'Cartago 2',
      'Encomiendas',
      'Heredia',
      'San Jose Central',
      'San Jose Coronado',
      'San Jose Escazu',
      'San Jose Este',
      'San Jose Oeste',
      'San Jose Sur',
      'Santa Ana',
    ];
    const rutas = new Set<string>(defaultRutas);
    feedback.forEach(f => {
      if (f.ruta) rutas.add(f.ruta);
    });
    return Array.from(rutas).sort();
  }, [feedback]);

  // Handlers

  const handleSelectFeedbackAll = (checked: boolean) => {
    if (checked) {
      setSelectedFeedback(new Set(filteredFeedback.map(f => f.id)));
    } else {
      setSelectedFeedback(new Set());
    }
  };

  const handleSelectPatternAll = (checked: boolean) => {
    if (checked) {
      setSelectedPatterns(new Set(filteredPatterns.map(p => p.id)));
    } else {
      setSelectedPatterns(new Set());
    }
  };

  const handleBulkDeleteFeedback = async () => {
    if (selectedFeedback.size === 0) return;
    if (!confirm(`¿Seguro que deseas eliminar ${selectedFeedback.size} registros de match_feedback?`)) return;
    try {
      await deleteMatchFeedbackBulk(Array.from(selectedFeedback));
      toast({ title: 'Eliminados', description: `${selectedFeedback.size} registros eliminados` });
      setSelectedFeedback(new Set());
    } catch (err) {
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    }
  };

  const handleBulkDeletePatterns = async () => {
    if (selectedPatterns.size === 0) return;
    if (!confirm(`¿Seguro que deseas eliminar ${selectedPatterns.size} patrones?`)) return;
    try {
      await deleteLearningPatternBulk(Array.from(selectedPatterns));
      toast({ title: 'Eliminados', description: `${selectedPatterns.size} patrones eliminados` });
      setSelectedPatterns(new Set());
    } catch (err) {
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    }
  };

  const handleAuditOrphans = async () => {
    setIsAuditing(true);
    try {
      const allSlCodes = Array.from(new Set([
        ...feedback.map(f => f.slCode),
        ...patterns.map(p => p.slCode)
      ]));
      const results = await checkOrphanLearningRecords(allSlCodes);
      setAuditResults(results);
      
      // Auto-select orphans in both tabs
      const orphanFeedbackIds = feedback.filter(f => results[f.slCode]).map(f => f.id);
      const orphanPatternIds = patterns.filter(p => results[p.slCode]).map(p => p.id);
      
      setSelectedFeedback(new Set(orphanFeedbackIds));
      setSelectedPatterns(new Set(orphanPatternIds));
      
      const totalOrphans = orphanFeedbackIds.length + orphanPatternIds.length;
      toast({ 
        title: 'Auditoría completada', 
        description: totalOrphans > 0 
          ? `Se encontraron ${totalOrphans} registros huérfanos y fueron seleccionados.`
          : 'No se encontraron registros huérfanos.' 
      });
    } catch (err) {
      toast({ title: 'Error en auditoría', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setIsAuditing(false);
    }
  };

  const handleCleanPrefixes = async () => {
    setIsCleaningPrefixes(true);
    try {
      const count = await cleanRoutingPrefixLearning();
      toast({
        title: 'Limpieza completada',
        description: count > 0 
          ? `Se limpiaron ${count} registros con prefijos de ruta (marcados como superseded).`
          : 'No se encontraron registros con prefijos de ruta para limpiar.',
      });
      if (count > 0) {
        setRefreshKey(k => k + 1);
      }
    } catch (err) {
      toast({ title: 'Error en limpieza', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setIsCleaningPrefixes(false);
    }
  };

  const handleDeleteFeedback = async () => {
    if (!deletingFeedback) return;
    try {
      await deleteMatchFeedback(deletingFeedback.id);
      toast({ title: 'Eliminado', description: `${deletingFeedback.manifestName} → ${deletingFeedback.slCode}` });
      setDeletingFeedback(null);
    } catch (err) {
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    }
  };

  const handleSupersedeFeedback = async () => {
    if (!supersedingFeedback) return;
    try {
      await supersedeFeedback(supersedingFeedback.id);
      toast({ title: 'Marcado como superseded', description: `${supersedingFeedback.manifestName} no se usará en matching` });
      setSupersedingFeedback(null);
    } catch (err) {
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    }
  };

  const handlePromoteFeedback = async () => {
    if (!promotingFeedback) return;
    try {
      await promoteFeedbackToAdmin(promotingFeedback.id);
      toast({ title: 'Promovido a Admin', description: `${promotingFeedback.manifestName} → ${promotingFeedback.slCode}` });
      setPromotingFeedback(null);
    } catch (err) {
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    }
  };

  const handleDeletePattern = async () => {
    if (!deletingPattern) return;
    try {
      await deleteLearningPattern(deletingPattern.id);
      toast({ title: 'Patrón eliminado', description: `${deletingPattern.rawName} → ${deletingPattern.slCode}` });
      setDeletingPattern(null);
    } catch (err) {
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    }
  };

  // ─── Manual Mapping Filtered Dropdown ────────────────────────────────────────
  const filteredCustomersForForm = useMemo(() => {
    const q = searchCustomerQuery.trim().toLowerCase();
    if (!q || (selectedCustomer && searchCustomerQuery === `${selectedCustomer.fullName} (${selectedCustomer.slCode})`)) {
      return [];
    }
    return customers.filter(
      c =>
        c.fullName?.toLowerCase().includes(q) ||
        c.slCode?.toLowerCase().includes(q) ||
        (c.name && c.name.toLowerCase().includes(q))
    ).slice(0, 8);
  }, [customers, searchCustomerQuery, selectedCustomer]);

  // ─── Customer Selection and Manual Mappings ──────────────────────────────────
  const handleSelectCustomer = (cust: CustomerData) => {
    setSelectedCustomer(cust);
    setSearchCustomerQuery(`${cust.fullName} (${cust.slCode})`);
    setManualRuta(cust.ruta || '');
    setManualConsolidation(cust.consolidationEnabled || false);
    setShowCustomerDropdown(false);
  };

  const handleSaveManualMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualManifestName.trim()) {
      toast({
        title: 'Campo requerido',
        description: 'Por favor ingresa el nombre tal como aparece en el manifiesto.',
        variant: 'destructive',
      });
      return;
    }
    if (!selectedCustomer) {
      toast({
        title: 'Cliente requerido',
        description: 'Por favor selecciona un cliente de la lista.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmittingManual(true);
    try {
      await createMatchFeedback(
        manualManifestName.trim(),
        selectedCustomer.slCode,
        selectedCustomer.fullName,
        manualRuta || null,
        manualConsolidation,
        'admin_manual'
      );
      toast({
        title: 'Mapeo manual guardado',
        description: `Se ha vinculado "${manualManifestName}" al cliente ${selectedCustomer.fullName} (${selectedCustomer.slCode}).`,
      });
      // Clear
      setManualManifestName('');
      setSearchCustomerQuery('');
      setSelectedCustomer(null);
      setManualRuta('');
      setManualConsolidation(false);
    } catch (err) {
      toast({
        title: 'Error al guardar mapeo',
        description: (err as Error).message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmittingManual(false);
    }
  };

  // ─── Match Simulator ──────────────────────────────────────────────────────────
  const handleSimulateMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!simName.trim()) return;
    setIsSimulating(true);
    try {
      const res = await findCustomerMatch(simName);
      setSimResult(res);
    } catch (err) {
      toast({
        title: 'Error en simulación',
        description: (err as Error).message,
        variant: 'destructive',
      });
    } finally {
      setIsSimulating(false);
    }
  };

  const handleApplySimToManual = (name: string, cust: CustomerData) => {
    setManualManifestName(name);
    setSelectedCustomer(cust);
    setSearchCustomerQuery(`${cust.fullName} (${cust.slCode})`);
    setManualRuta(cust.ruta || '');
    setManualConsolidation(cust.consolidationEnabled || false);
    toast({
      title: 'Simulación copiada',
      description: 'Los datos de la simulación se han copiado al formulario de mapeo manual.',
    });
  };



  return (
    <DashboardLayout>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="space-y-4 p-4 md:p-6"
        data-testid="nova-learning-page"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-100 dark:bg-violet-900/30 rounded-lg" aria-hidden="true">
              <Brain className="h-6 w-6 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">Nova Learning</h1>
              <p className="text-xs text-muted-foreground">Administrar datos de aprendizaje que Nova usa para matching automático</p>
            </div>
          </div>
          
          <div className="flex gap-2 font-medium">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCleanPrefixes}
              disabled={isCleaningPrefixes || feedback.length === 0}
              className="gap-2 text-violet-600 border-violet-200 hover:bg-violet-50 dark:text-violet-400 dark:border-violet-850 dark:hover:bg-violet-950/30"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isCleaningPrefixes && 'animate-spin')} />
              {isCleaningPrefixes ? 'Limpiando...' : 'Limpiar Prefijos de Ruta'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAuditOrphans}
              disabled={isAuditing || (feedback.length === 0 && patterns.length === 0)}
              className="gap-2 text-amber-600 border-amber-200 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-900/50 dark:hover:bg-amber-950/20"
            >
              <ShieldAlert className={cn('h-3.5 w-3.5', isAuditing && 'animate-pulse')} />
              {isAuditing ? 'Auditando...' : 'Auditar Huérfanos'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRefreshKey(k => k + 1)}
              disabled={loadingFeedback || loadingPatterns}
              className="gap-2"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', (loadingFeedback || loadingPatterns) && 'animate-spin')} />
              Actualizar
            </Button>
          </div>

        </div>

        <Tabs defaultValue="feedback" className="w-full">
          <TabsList className="grid w-full max-w-2xl grid-cols-3">
            <TabsTrigger value="feedback" className="gap-2">
              <Database className="h-4 w-4" />
              Match Feedback
            </TabsTrigger>
            <TabsTrigger value="patterns" className="gap-2">
              <Sparkles className="h-4 w-4" />
              Patterns
            </TabsTrigger>
            <TabsTrigger value="cognitive" className="gap-2">
              <Brain className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              Aprendizaje Cognitivo
            </TabsTrigger>
          </TabsList>

          {/* ── TAB: match_feedback ───────────────────────────────────────────── */}
          <TabsContent value="feedback" className="space-y-4 mt-4">

            
            {/* Actions Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/40 p-3 rounded-lg border border-border">
              <div className="flex items-center gap-3">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkDeleteFeedback}
                  disabled={selectedFeedback.size === 0}
                  className="gap-2 h-8"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Eliminar Selección ({selectedFeedback.size})
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2">
                  <Select value={filterSource} onValueChange={setFilterSource}>
                    <SelectTrigger className="w-[130px] h-8 text-xs">
                      <SelectValue placeholder="Origen" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos Orígenes</SelectItem>
                      <SelectItem value="admin_pick">Admin Pick</SelectItem>
                      <SelectItem value="admin_manual">Admin Manual</SelectItem>
                      <SelectItem value="admin_sp2">Admin SP2</SelectItem>
                      <SelectItem value="ai_auto">AI Auto</SelectItem>
                      <SelectItem value="ai_superseded">Superseded</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={filterRuta} onValueChange={setFilterRuta}>
                    <SelectTrigger className="w-[120px] h-8 text-xs">
                      <SelectValue placeholder="Ruta" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas Rutas</SelectItem>
                      <SelectItem value="none">Sin Ruta</SelectItem>
                      {availableRutas.map(r => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={filterConsolidation} onValueChange={setFilterConsolidation}>
                    <SelectTrigger className="w-[140px] h-8 text-xs">
                      <SelectValue placeholder="Consolidación" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      <SelectItem value="yes">Con Consolidación</SelectItem>
                      <SelectItem value="no">Sin Consolidación</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>


            {/* Search */}
            <Card className="p-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nombre del manifiesto, slCode, nombre completo o ruta…"
                  value={searchFeedback}
                  onChange={e => setSearchFeedback(e.target.value)}
                  className="pl-9"
                />
              </div>
            </Card>

            {/* Table */}
            <Card className="overflow-hidden">
              {loadingFeedback ? (
                <div className="flex flex-col items-center justify-center py-16 space-y-3">
                  <RefreshCw className="h-8 w-8 text-muted-foreground animate-spin" />
                  <p className="text-sm text-muted-foreground">Buscando en match_feedback…</p>
                </div>
              ) : filteredFeedback.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 space-y-3">
                  <Search className="h-12 w-12 text-muted-foreground/60" />
                  <p className="text-base font-semibold text-foreground">
                    {searchFeedback ? 'No se encontraron resultados' : 'Búsqueda bajo demanda (0 lecturas al cargar)'}
                  </p>
                  <p className="text-xs text-muted-foreground max-w-md text-center">
                    {searchFeedback
                      ? 'Intenta con otro término de búsqueda o cambia los filtros de origen y ruta.'
                      : 'Ingresa un nombre de manifiesto, código SL (ej. SL72) o nombre de cliente en la barra de búsqueda para consultar registros específicos.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b border-border">
                      <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="px-4 py-3 w-10">
                          <Checkbox
                            checked={filteredFeedback.length > 0 && selectedFeedback.size === filteredFeedback.length}
                            onCheckedChange={(c) => handleSelectFeedbackAll(c as boolean)}
                            aria-label="Seleccionar todos"
                          />
                        </th>
                        <th className="px-4 py-3 font-semibold">Origen</th>
                        <th className="px-4 py-3 font-semibold">Manifest Name</th>
                        <th className="px-4 py-3 font-semibold">slCode</th>
                        <th className="px-4 py-3 font-semibold">Nombre</th>
                        <th className="px-4 py-3 font-semibold">Ruta</th>
                        <th className="px-4 py-3 font-semibold text-center">Hits</th>
                        <th className="px-4 py-3 font-semibold">Confirmado</th>
                        <th className="px-4 py-3 font-semibold text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredFeedback.map(f => (
                        <tr
                          key={f.id}
                          className={cn(
                            'border-b border-border hover:bg-accent/40 transition-colors',
                            f.source === 'ai_superseded' && 'opacity-60'
                          )}
                        >
                          <td className="px-4 py-3">
                            <Checkbox
                              checked={selectedFeedback.has(f.id)}
                              onCheckedChange={(c) => {
                                const next = new Set(selectedFeedback);
                                if (c) next.add(f.id);
                                else next.delete(f.id);
                                setSelectedFeedback(next);
                              }}
                              aria-label={`Seleccionar ${f.manifestName}`}
                            />
                          </td>
                          <td className="px-4 py-3">{sourceBadge(f.source)}</td>
                          <td className="px-4 py-3 font-medium">
                            <div className="flex flex-col gap-1 items-start">
                              <span className="break-all">{f.manifestName}</span>
                              <div className="flex flex-wrap gap-1">
                                {hasRoutingPrefix(f.manifestName || '') && (
                                  <Badge variant="outline" className="text-[9px] h-3.5 px-1 border-amber-300 text-amber-600 bg-amber-50 dark:bg-amber-950/20" title="Contiene prefijo de ruta (ej: ALAJUELA, BB, HEREDIA...)">
                                    Prefijo de Ruta
                                  </Badge>
                                )}
                                {auditResults[f.slCode] && (
                                  <Badge variant="destructive" className="text-[9px] h-3.5 px-1" title="Cliente huérfano (No existe en base)">
                                    Huérfano
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className="font-mono text-xs">
                              <Hash className="h-3 w-3 mr-1" />
                              {f.slCode}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">{f.fullName}</td>
                          <td className="px-4 py-3">
                            {f.ruta ? (
                              <Badge variant="secondary" className="text-xs">
                                <Route className="h-3 w-3 mr-1" />
                                {f.ruta}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs italic">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center font-semibold">
                            <div className="flex items-center justify-center gap-2">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 rounded-full hover:bg-accent hover:text-accent-foreground"
                                onClick={() => handleUpdateHits(f.id, f.hitCount, -1)}
                                disabled={f.hitCount <= 0}
                                title="Decrementar hits"
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                              <span className="w-6 text-center">{f.hitCount}</span>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 rounded-full hover:bg-accent hover:text-accent-foreground"
                                onClick={() => handleUpdateHits(f.id, f.hitCount, 1)}
                                title="Incrementar hits"
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDate(f.confirmedAt)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              {f.source === 'ai_auto' && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setPromotingFeedback(f)}
                                    className="h-8 w-8 p-0 text-emerald-600"
                                    title="Promover a Admin (confirmar correcto)"
                                    aria-label="Promover"
                                  >
                                    <ThumbsUp className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setSupersedingFeedback(f)}
                                    className="h-8 w-8 p-0 text-amber-600"
                                    title="Superseded (incorrecto, no usar)"
                                    aria-label="Superseded"
                                  >
                                    <ThumbsDown className="h-3.5 w-3.5" />
                                  </Button>
                                </>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenEdit(f)}
                                className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700"
                                title="Editar registro"
                                aria-label="Editar"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeletingFeedback(f)}
                                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                aria-label="Eliminar"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {!loadingFeedback && filteredFeedback.length > 0 && (
                <div className="px-4 py-2.5 border-t border-border bg-muted/30 text-xs text-muted-foreground flex items-center justify-between">
                  <span>Mostrando <strong>{filteredFeedback.length}</strong> resultados</span>
                  <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> Búsqueda optimizada</span>
                </div>
              )}
            </Card>
          </TabsContent>

          {/* ── TAB: manifest_learning_patterns ──────────────────────────────── */}
          <TabsContent value="patterns" className="space-y-4 mt-4">
            {/* Actions Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/40 p-3 rounded-lg border border-border">
              <div className="flex items-center gap-3">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkDeletePatterns}
                  disabled={selectedPatterns.size === 0}
                  className="gap-2 h-8"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Eliminar Selección ({selectedPatterns.size})
                </Button>
              </div>
            </div>

            {/* Search */}
            <Card className="p-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por rawName, matchedName o slCode…"
                  value={searchPatterns}
                  onChange={e => setSearchPatterns(e.target.value)}
                  className="pl-9"
                />
              </div>
            </Card>

            {/* Table */}
            <Card className="overflow-hidden">
              {loadingPatterns ? (
                <div className="flex flex-col items-center justify-center py-16 space-y-3">
                  <RefreshCw className="h-8 w-8 text-muted-foreground animate-spin" />
                  <p className="text-sm text-muted-foreground">Buscando en learning_patterns…</p>
                </div>
              ) : filteredPatterns.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 space-y-3">
                  <Search className="h-12 w-12 text-muted-foreground/60" />
                  <p className="text-base font-semibold text-foreground">
                    {searchPatterns ? 'No se encontraron resultados' : 'Búsqueda de patrones bajo demanda'}
                  </p>
                  <p className="text-xs text-muted-foreground max-w-md text-center">
                    {searchPatterns
                      ? 'Intenta con otro nombre o código SL.'
                      : 'Ingresa un nombre de manifiesto o código SL en la barra de búsqueda para consultar patrones de aprendizaje específicos.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b border-border">
                      <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="px-4 py-3 w-10">
                          <Checkbox
                            checked={filteredPatterns.length > 0 && selectedPatterns.size === filteredPatterns.length}
                            onCheckedChange={(c) => handleSelectPatternAll(c as boolean)}
                            aria-label="Seleccionar todos"
                          />
                        </th>
                        <th className="px-4 py-3 font-semibold">Raw Name (manifest)</th>
                        <th className="px-4 py-3 font-semibold">Matched Name</th>
                        <th className="px-4 py-3 font-semibold">slCode</th>
                        <th className="px-4 py-3 font-semibold text-center">Score</th>
                        <th className="px-4 py-3 font-semibold text-center">Aprobaciones</th>
                        <th className="px-4 py-3 font-semibold">Aprobado por</th>
                        <th className="px-4 py-3 font-semibold text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPatterns.map(p => (
                        <tr key={p.id} className="border-b border-border hover:bg-accent/40 transition-colors">
                          <td className="px-4 py-3">
                            <Checkbox
                              checked={selectedPatterns.has(p.id)}
                              onCheckedChange={(c) => {
                                const next = new Set(selectedPatterns);
                                if (c) next.add(p.id);
                                else next.delete(p.id);
                                setSelectedPatterns(next);
                              }}
                              aria-label={`Seleccionar ${p.rawName}`}
                            />
                          </td>
                          <td className="px-4 py-3 font-medium">
                            <div className="flex flex-col gap-1 items-start">
                              <span className="break-all">{p.rawName}</span>
                              <div className="flex flex-wrap gap-1">
                                {hasRoutingPrefix(p.rawName || '') && (
                                  <Badge variant="outline" className="text-[9px] h-3.5 px-1 border-amber-300 text-amber-600 bg-amber-50 dark:bg-amber-950/20" title="Contiene prefijo de ruta (ej: ALAJUELA, BB, HEREDIA...)">
                                    Prefijo de Ruta
                                  </Badge>
                                )}
                                {auditResults[p.slCode] && (
                                  <Badge variant="destructive" className="text-[9px] h-3.5 px-1" title="Cliente huérfano (No existe en base)">
                                    Huérfano
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">{p.matchedName}</td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className="font-mono text-xs">
                              <Hash className="h-3 w-3 mr-1" />
                              {p.slCode}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge variant={p.matchScore >= 0.9 ? 'default' : p.matchScore >= 0.7 ? 'secondary' : 'outline'} className="text-xs">
                              {Math.round(p.matchScore * 100)}%
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-center font-semibold">
                            <span className={cn(p.approvalCount >= 3 ? 'text-emerald-600' : 'text-muted-foreground')}>
                              {p.approvalCount}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{p.approvedBy ?? '—'}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeletingPattern(p)}
                                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                aria-label="Eliminar"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {!loadingPatterns && filteredPatterns.length > 0 && (
                <div className="px-4 py-2.5 border-t border-border bg-muted/30 text-xs text-muted-foreground flex items-center justify-between">
                  <span>Mostrando <strong>{filteredPatterns.length}</strong> patrones</span>
                  <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> Búsqueda optimizada</span>
                </div>
              )}
            </Card>
          </TabsContent>

          {/* ── TAB: cognitive (Aprendizaje Cognitivo & Predictivo) ────────────────── */}
          <TabsContent value="cognitive" className="space-y-4 mt-4">


            {/* Manual Mappings and Simulator Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Column 1: Simulator */}
              <Card className="p-4 flex flex-col space-y-4 shadow-sm bg-card/60 backdrop-blur-sm border border-border/80">
                <div className="flex items-center gap-2 border-b pb-2">
                  <Search className="h-5 w-5 text-violet-500" />
                  <div>
                    <h3 className="font-semibold text-sm">Simulador de Matching de Nova</h3>
                    <p className="text-[11px] text-muted-foreground">
                      Prueba nombres de manifiesto en tiempo real para ver cómo los procesaría la IA y los algoritmos
                    </p>
                  </div>
                </div>

                <form onSubmit={handleSimulateMatch} className="flex gap-2">
                  <Input
                    placeholder="Ej: TATIANA AGUIRRE MORALES"
                    value={simName}
                    onChange={e => setSimName(e.target.value)}
                    disabled={isSimulating}
                    className="h-9"
                  />
                  <Button type="submit" size="sm" disabled={isSimulating || !simName.trim()} className="h-9 bg-violet-600 text-white hover:bg-violet-700">
                    {isSimulating ? 'Simulando...' : 'Simular'}
                  </Button>
                </form>

                <div className="flex-1 overflow-y-auto max-h-[300px] min-h-[150px] border rounded-lg bg-muted/20 p-3 space-y-3">
                  {!simResult && !isSimulating && (
                    <div className="h-full flex flex-col items-center justify-center text-center p-4 space-y-1 text-muted-foreground">
                      <HelpCircle className="h-8 w-8 text-muted-foreground/60" />
                      <p className="text-xs font-medium">Ingresa un nombre para evaluar las ponderaciones de coincidencia.</p>
                    </div>
                  )}

                  {isSimulating && (
                    <div className="h-full flex items-center justify-center py-10">
                      <RefreshCw className="h-6 w-6 text-muted-foreground animate-spin" />
                    </div>
                  )}

                  {simResult && !isSimulating && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between border-b pb-2">
                        <span className="text-xs font-semibold text-foreground">Resultado de Evaluación:</span>
                        {simResult.exactMatch ? (
                          <Badge variant="default" className="bg-emerald-600 text-white font-medium text-[10px] h-5">Coincidencia Aceptada</Badge>
                        ) : (
                          <Badge variant="outline" className="border-amber-300 text-amber-600 font-medium text-[10px] h-5">Requiere Asistente IA</Badge>
                        )}
                      </div>

                      {simResult.bestMatch ? (
                        <div className="p-2.5 rounded border bg-card/60 space-y-2">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="text-xs font-bold text-foreground">{simResult.bestMatch.customer.fullName}</p>
                              <span className="text-[10px] font-mono text-muted-foreground">{simResult.bestMatch.customer.slCode}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-xs font-bold text-violet-600 dark:text-violet-400">
                                {Math.round(simResult.bestMatch.score * 100)}% Match
                              </span>
                              <span className="block text-[8px] text-muted-foreground">algoritmo: {simResult.bestMatch.matchType}</span>
                            </div>
                          </div>

                          {/* Progress bar of score */}
                          <div className="w-full bg-muted h-1 rounded-full overflow-hidden">
                            <div
                              className={cn(
                                'h-full',
                                simResult.bestMatch.score >= 0.85 ? 'bg-emerald-500' : simResult.bestMatch.score >= 0.7 ? 'bg-amber-500' : 'bg-red-500'
                              )}
                              style={{ width: `${simResult.bestMatch.score * 100}%` }}
                            />
                          </div>

                          <div className="flex justify-between items-center text-[10px] text-muted-foreground pt-1">
                            <span>Ruta sugerida: {simResult.bestMatch.customer.ruta || 'Sin Ruta'}</span>
                            <button
                              onClick={() => handleApplySimToManual(simResult.searchedName, simResult.bestMatch.customer)}
                              className="text-violet-600 hover:underline font-medium dark:text-violet-400"
                            >
                              Fijar Mapeo Manual
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground text-center py-4">No se hallaron coincidencias razonables.</p>
                      )}

                      {simResult.candidates && simResult.candidates.length > 1 && (
                        <div className="space-y-1.5 pt-1">
                          <span className="text-[10px] font-semibold text-muted-foreground uppercase">Otros candidatos posibles:</span>
                          <div className="space-y-1">
                            {simResult.candidates.slice(1, 4).map((cand: any, idx: number) => (
                              <div key={idx} className="flex justify-between items-center text-xs p-1.5 rounded border border-dashed hover:bg-muted/40 transition-colors">
                                <div>
                                  <span className="font-medium text-foreground">{cand.customer.fullName}</span>
                                  <span className="text-[9px] font-mono text-muted-foreground ml-1.5">({cand.customer.slCode})</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-[11px]">{Math.round(cand.score * 100)}%</span>
                                  <button
                                    onClick={() => handleApplySimToManual(simResult.searchedName, cand.customer)}
                                    className="text-[10px] text-violet-600 hover:underline dark:text-violet-400"
                                  >
                                    Fijar
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Card>

              {/* Column 2: Manual Creator */}
              <Card className="p-4 flex flex-col space-y-4 shadow-sm bg-card/60 backdrop-blur-sm border border-border/80">
                <div className="flex items-center gap-2 border-b pb-2">
                  <UserCheck className="h-5 w-5 text-emerald-500" />
                  <div>
                    <h3 className="font-semibold text-sm">Creador Manual de Mapeos</h3>
                    <p className="text-[11px] text-muted-foreground">
                      Instaura aprendizajes inmediatos asociando un nombre de manifiesto a un cliente
                    </p>
                  </div>
                </div>

                <form onSubmit={handleSaveManualMapping} className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground block">Nombre en Manifiesto:</label>
                    <Input
                      placeholder="Ej: FRANCINY AGUIRRE MORALES"
                      value={manualManifestName}
                      onChange={e => setManualManifestName(e.target.value)}
                      disabled={isSubmittingManual}
                      className="h-9"
                    />
                  </div>

                  <div className="space-y-1 relative">
                    <label className="text-xs font-semibold text-muted-foreground block">Vincular al Cliente:</label>
                    <Input
                      placeholder="Escribe para buscar por nombre o SL Code..."
                      value={searchCustomerQuery}
                      onChange={e => {
                        setSearchCustomerQuery(e.target.value);
                        setShowCustomerDropdown(true);
                      }}
                      onFocus={() => setShowCustomerDropdown(true)}
                      disabled={isSubmittingManual}
                      className="h-9"
                    />

                    {showCustomerDropdown && filteredCustomersForForm.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-popover text-popover-foreground border rounded-md shadow-lg max-h-60 overflow-y-auto">
                        {filteredCustomersForForm.map(c => (
                          <div
                            key={c.slCode}
                            onClick={() => handleSelectCustomer(c)}
                            className="px-3 py-2 text-xs hover:bg-accent hover:text-accent-foreground cursor-pointer flex justify-between items-center"
                          >
                            <span className="font-medium">{c.fullName}</span>
                            <span className="text-[10px] text-muted-foreground font-mono">{c.slCode}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {selectedCustomer && (
                    <div className="p-2.5 rounded bg-emerald-50/20 dark:bg-emerald-950/10 border border-emerald-100 dark:border-emerald-950/40 space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-semibold text-emerald-800 dark:text-emerald-300">Cliente Seleccionado:</span>
                        <Badge variant="outline" className="font-mono text-[9px]">{selectedCustomer.slCode}</Badge>
                      </div>
                      <p className="text-xs font-bold text-foreground">{selectedCustomer.fullName}</p>
                      
                      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-emerald-100/50 dark:border-emerald-950/50">
                        <div className="space-y-0.5">
                          <label className="text-[9px] text-muted-foreground block">Ruta Asociada:</label>
                          <select
                            value={manualRuta}
                            onChange={e => setManualRuta(e.target.value)}
                            className="w-full text-xs bg-transparent border rounded p-1 h-7 text-foreground"
                          >
                            <option value="">Sin Ruta</option>
                            {availableRutas.map(r => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex flex-col justify-end">
                          <div className="flex items-center gap-1.5 h-7">
                            <Checkbox
                              id="manualCons"
                              checked={manualConsolidation}
                              onCheckedChange={c => setManualConsolidation(c as boolean)}
                            />
                            <label htmlFor="manualCons" className="text-[10px] font-semibold text-muted-foreground cursor-pointer">
                              Consolidar
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end pt-1">
                    <Button
                      type="submit"
                      disabled={isSubmittingManual || !manualManifestName.trim() || !selectedCustomer}
                      className="bg-emerald-600 text-white hover:bg-emerald-700 font-semibold w-full sm:w-auto"
                    >
                      {isSubmittingManual ? 'Guardando...' : 'Crear Mapeo de Aprendizaje'}
                    </Button>
                  </div>
                </form>
              </Card>
            </div>

            {/* Repetitividad / Clientes Table */}
            <Card className="p-4 flex flex-col space-y-3 shadow-sm bg-card/60 backdrop-blur-sm">
              <div className="flex items-center justify-between gap-4 flex-wrap border-b pb-3">
                <div>
                  <h3 className="font-semibold text-sm">Frecuencia y Repetitividad de Clientes</h3>
                  <p className="text-[11px] text-muted-foreground">
                    Patrones de comportamiento y variaciones de nombre aprendidos por Nova
                  </p>
                </div>
              </div>

              {/* Filters & Search Row */}
              <div className="flex flex-wrap gap-2 items-center justify-between pb-2 border-b border-border/40">
                <div className="flex-1 min-w-[200px] relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por cliente o SL Code..."
                    value={searchCognitive}
                    onChange={e => setSearchCognitive(e.target.value)}
                    className="pl-8 text-xs h-9 bg-background/50"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Select value={filterCognitiveUsage} onValueChange={setFilterCognitiveUsage}>
                    <SelectTrigger className="h-9 text-xs w-[140px] bg-background/50">
                      <SelectValue placeholder="Nivel de Uso" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Cualquier Nivel</SelectItem>
                      <SelectItem value="vip">{"VIP (>=15)"}</SelectItem>
                      <SelectItem value="frequent">Frecuente (6-14)</SelectItem>
                      <SelectItem value="regular">Regular (3-5)</SelectItem>
                      <SelectItem value="occasional">{"Ocasional (<3)"}</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={filterCognitiveRuta} onValueChange={setFilterCognitiveRuta}>
                    <SelectTrigger className="h-9 text-xs w-[140px] bg-background/50">
                      <SelectValue placeholder="Ruta" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas las Rutas</SelectItem>
                      <SelectItem value="none">Sin Ruta</SelectItem>
                      {availableRutas.map(r => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={filterCognitiveConsolidation} onValueChange={setFilterCognitiveConsolidation}>
                    <SelectTrigger className="h-9 text-xs w-[150px] bg-background/50">
                      <SelectValue placeholder="Consolidación" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Consolidación: Todas</SelectItem>
                      <SelectItem value="yes">Habilitada</SelectItem>
                      <SelectItem value="no">Deshabilitada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {loadingCustomers ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-3">
                  <RefreshCw className="h-6 w-6 text-muted-foreground animate-spin" />
                  <p className="text-xs text-muted-foreground">Cargando base de clientes…</p>
                </div>
              ) : !searchCognitive.trim() ? (
                <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground space-y-2">
                  <Search className="h-10 w-10 text-muted-foreground/30 animate-pulse" />
                  <p className="text-xs font-semibold">Búsqueda de Patrones y Frecuencias</p>
                  <p className="text-[11px] text-muted-foreground max-w-sm">
                    Ingresa el nombre o SL Code en el buscador superior para cargar los patrones de repetitividad del cliente.
                  </p>
                </div>
              ) : filteredCognitive.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                  <Search className="h-10 w-10 text-muted-foreground/40" />
                  <p className="text-xs font-semibold mt-2">No se encontraron patrones que coincidan con la búsqueda.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b border-border">
                      <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="px-4 py-3 font-semibold">Cliente</th>
                        <th className="px-4 py-3 font-semibold text-center">Nivel de Uso</th>
                        <th className="px-4 py-3 font-semibold text-center">Hits (Cant. Paquetes)</th>
                        <th className="px-4 py-3 font-semibold">Variantes de Nombre</th>
                        <th className="px-4 py-3 font-semibold">Patrón Logístico Detectado</th>
                        <th className="px-4 py-3 font-semibold">Ruta Asignada</th>
                        <th className="px-4 py-3 font-semibold text-center">Consolidación Automática</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCognitive.map(d => {
                        // 1. Uso Tier
                        let tierLabel = 'Ocasional';
                        let tierColor = 'border-slate-200 text-slate-600 bg-slate-50 dark:bg-slate-900/30 dark:border-slate-800';
                        if (d.totalHits >= 15) {
                          tierLabel = 'VIP (Crítico)';
                          tierColor = 'border-emerald-200 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-900/50';
                        } else if (d.totalHits >= 6) {
                          tierLabel = 'Frecuente';
                          tierColor = 'border-violet-200 text-violet-600 bg-violet-50 dark:bg-violet-950/20 dark:border-violet-900/50';
                        } else if (d.totalHits >= 3) {
                          tierLabel = 'Regular';
                          tierColor = 'border-blue-200 text-blue-600 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-900/50';
                        }

                        // 2. Patrón Logístico Detectado
                        let patternText = 'Estable';
                        let patternBadgeColor = 'border-gray-200 text-gray-500 bg-gray-50 dark:bg-gray-900/20';
                        if (d.totalHits >= 6 && !d.consolidationEnabled) {
                          patternText = '⚠️ Frecuente sin consolidar';
                          patternBadgeColor = 'border-amber-200 text-amber-600 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900/50';
                        } else if (d.totalHits >= 6 && d.consolidationEnabled) {
                          patternText = '✨ Consolidación activa';
                          patternBadgeColor = 'border-emerald-200 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-900/50';
                        } else if (d.manifestNames.size > 2) {
                          patternText = '🔍 Multi-ortografía (alias)';
                          patternBadgeColor = 'border-blue-200 text-blue-600 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-900/50';
                        } else if (!d.currentRuta) {
                          patternText = '📍 Ruta no asignada';
                          patternBadgeColor = 'border-red-200 text-red-600 bg-red-50 dark:bg-red-950/20 dark:border-red-900/50';
                        }

                        return (
                          <tr key={d.slCode} className="border-b border-border hover:bg-accent/30 transition-colors">
                            <td className="px-4 py-3">
                              <div>
                                <span className="font-semibold text-xs text-foreground block">{d.fullName}</span>
                                <Badge variant="outline" className="font-mono text-[9px] mt-1 text-muted-foreground px-1 h-3.5">
                                  {d.slCode}
                                </Badge>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Badge variant="outline" className={cn("text-[10px] font-medium px-1.5 py-0.5", tierColor)}>
                                {tierLabel}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-center font-bold text-violet-600 dark:text-violet-400 text-sm">
                              {d.totalHits}
                            </td>
                            <td className="px-4 py-3 text-xs">
                              <div className="flex flex-wrap gap-1 max-w-[300px]">
                                {Array.from(d.manifestNames).map((name, i) => {
                                  const record = d.records.find(r => r.manifestName === name);
                                  return (
                                    <Badge
                                      key={i}
                                      variant="secondary"
                                      className="text-[9px] bg-muted/60 py-0.5 pl-1.5 pr-1 font-normal flex items-center gap-1 group/variant"
                                    >
                                      <span>{name}</span>
                                      {record && (
                                        <button
                                          onClick={() => setDeletingFeedback(record)}
                                          className="text-muted-foreground hover:text-destructive hover:scale-110 transition-all shrink-0 ml-0.5 cursor-pointer"
                                          title={`Eliminar variante "${name}"`}
                                        >
                                          <X className="h-2.5 w-2.5" />
                                        </button>
                                      )}
                                    </Badge>
                                  );
                                })}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className={cn("text-[10px] font-semibold px-2 py-0.5", patternBadgeColor)}>
                                {patternText}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5">
                                <Select
                                  value={d.currentRuta || 'none'}
                                  onValueChange={(val) => handleAlignCustomerRoute(d.slCode, val === 'none' ? '' : val)}
                                  disabled={updatingRuta[d.slCode]}
                                >
                                  <SelectTrigger className="h-7 text-xs w-[140px] bg-transparent border-slate-200 dark:border-slate-800">
                                    <SelectValue placeholder="Sin Ruta" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">Sin Ruta</SelectItem>
                                    {availableRutas.map(r => (
                                      <SelectItem key={r} value={r}>{r}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {updatingRuta[d.slCode] && (
                                  <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center">
                                <Button
                                  size="sm"
                                  variant={d.consolidationEnabled ? 'default' : 'outline'}
                                  disabled={updatingConsolidation[d.slCode]}
                                  onClick={() => handleToggleConsolidation(d.slCode, d.consolidationEnabled)}
                                  className={cn(
                                    "h-6 px-2 text-[10px] gap-1 transition-all rounded",
                                    d.consolidationEnabled 
                                      ? "bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm"
                                      : "border-gray-300 text-gray-500 hover:bg-gray-50 dark:border-gray-700"
                                  )}
                                >
                                  {updatingConsolidation[d.slCode] ? (
                                    <RefreshCw className="h-2.5 w-2.5 animate-spin" />
                                  ) : d.consolidationEnabled ? (
                                    <>
                                      <CheckCircle2 className="h-2.5 w-2.5" />
                                      Activa
                                    </>
                                  ) : (
                                    'Inactiva'
                                  )}
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>

        {/* Info banner */}
        <Card className="p-4 bg-violet-50 dark:bg-violet-950/20 border-violet-200 dark:border-violet-900/50">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-violet-600 dark:text-violet-400 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1 text-violet-800 dark:text-violet-300">
              <p className="font-semibold">Acerca del aprendizaje de Nova</p>
              <p>
                <strong>match_feedback</strong> es la colección principal: cada vez que un operador confirma un match
                (o la IA lo aprueba auto), se guarda aquí. Nova revisa esta tabla <em>antes</em> de hacer matching
                algorítmico o por IA.
              </p>
              <p>
                <strong>manifest_learning_patterns</strong> guarda los ThumbsUp que das en la tabla de Nova.
                Tienen menos prioridad que match_feedback.
              </p>
              <p>
                Si un match aprendido está mal (ej: "ALAJUELA FRANCISCO MEJIA" → SL equivocado),
                puedes marcarlo como <strong>Superseded</strong> (o eliminarlo) para que no vuelva a ocurrir.
              </p>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* ── Dialogs ───────────────────────────────────────────────────────────── */}

      {/* Delete Feedback */}
      <AlertDialog open={!!deletingFeedback} onOpenChange={v => { if (!v) setDeletingFeedback(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive" />
              Eliminar match_feedback
            </AlertDialogTitle>
            <AlertDialogDescription>
              ¿Eliminar permanentemente <strong>{deletingFeedback?.manifestName}</strong> → <span className="font-mono">{deletingFeedback?.slCode}</span>?
              <br />Esto no se puede deshacer y Nova ya no usará este mapeo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteFeedback} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Supersede Feedback */}
      <AlertDialog open={!!supersedingFeedback} onOpenChange={v => { if (!v) setSupersedingFeedback(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ThumbsDown className="h-4 w-4 text-amber-600" />
              Marcar como incorrecto (Superseded)
            </AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{supersedingFeedback?.manifestName}</strong> → <span className="font-mono">{supersedingFeedback?.slCode}</span> se marcará como <code>ai_superseded</code>.
              <br />Nova lo ignorará en futuras cargas, pero queda en base por audit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleSupersedeFeedback} className="bg-amber-600 text-white hover:bg-amber-700">
              Superseded
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Promote Feedback */}
      <AlertDialog open={!!promotingFeedback} onOpenChange={v => { if (!v) setPromotingFeedback(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ThumbsUp className="h-4 w-4 text-emerald-600" />
              Confirmar como correcto (Promover)
            </AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{promotingFeedback?.manifestName}</strong> → <span className="font-mono">{promotingFeedback?.slCode}</span> se promoverá a <code>admin_pick</code>.
              <br />Esto le da máxima prioridad sobre entradas AI.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handlePromoteFeedback} className="bg-emerald-600 text-white hover:bg-emerald-700">
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Pattern */}
      <AlertDialog open={!!deletingPattern} onOpenChange={v => { if (!v) setDeletingPattern(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive" />
              Eliminar patrón
            </AlertDialogTitle>
            <AlertDialogDescription>
              ¿Eliminar <strong>{deletingPattern?.rawName}</strong> → <span className="font-mono">{deletingPattern?.slCode}</span>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeletePattern} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Match Feedback */}
      <AlertDialog open={!!editingFeedback} onOpenChange={v => { if (!v) setEditingFeedback(null); }}>
        <AlertDialogContent className="sm:max-w-[480px]">
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Pencil className="h-4 w-4 text-blue-600" />
                Editar Mapeo de Aprendizaje
              </AlertDialogTitle>
              <AlertDialogDescription>
                Modifica el patrón de coincidencia y corrige la ortografía o asignación del cliente para Nova.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="space-y-3 py-2 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-muted-foreground block">Nombre en Manifiesto:</label>
                <Input
                  value={editManifestName}
                  onChange={e => setEditManifestName(e.target.value)}
                  placeholder="Ej: SL ORLANDO BRONES"
                  className="text-xs h-9"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-muted-foreground block">SL Code del Cliente:</label>
                <Input
                  value={editSlCode}
                  onChange={e => setEditSlCode(e.target.value.toUpperCase())}
                  placeholder="Ej: SL261696"
                  className="text-xs font-mono h-9"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-muted-foreground block">Nombre Completo del Cliente:</label>
                <Input
                  value={editFullName}
                  onChange={e => setEditFullName(e.target.value)}
                  placeholder="Ej: ORLANDO BRENES SOLANO"
                  className="text-xs h-9"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="space-y-1">
                  <label className="font-semibold text-muted-foreground block font-sans">Ruta Asociada:</label>
                  <Select value={editRuta || 'none'} onValueChange={val => setEditRuta(val === 'none' ? '' : val)}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Sin Ruta" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin Ruta</SelectItem>
                      {availableRutas.map(r => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col justify-end">
                  <div className="flex items-center gap-1.5 h-9">
                    <Checkbox
                      id="editConsolidation"
                      checked={editConsolidation}
                      onCheckedChange={c => setEditConsolidation(c as boolean)}
                    />
                    <label htmlFor="editConsolidation" className="text-xs font-semibold text-muted-foreground cursor-pointer select-none">
                      Habilitar Consolidación
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <AlertDialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setEditingFeedback(null)} className="h-9 text-xs">
                Cancelar
              </Button>
              <Button type="submit" disabled={isSavingEdit} className="bg-blue-600 text-white hover:bg-blue-700 h-9 text-xs">
                {isSavingEdit ? 'Guardando...' : 'Guardar Cambios'}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
