import { useState, useCallback, useEffect } from 'react';
import { useLocale } from './useLocale';
import { getAuthToken } from '@/lib/auth/auth-client';
import { recordManifestLearning } from '@/lib/services/manifest-learning-service';
import {
  processManifestFile,
  saveManifestRecord,
  loadManifestFromFirestore,
  downloadCSV as downloadCSVFile,
  downloadXLSX as downloadXLSXFile,
  type ProcessingResult,
  type ProcessingStep as ServiceProcessingStep
} from '@/lib/services/manifest-processor';
import { updateCustomerRuta } from '@/lib/services/customer-sync';
import { warmLearnedCache } from '@/lib/services/match-learning';

export interface NovaFile {
  id: string;
  name: string;
  size: number;
  type: string;
  data: string; // Base64 encoded
  status: 'pending' | 'processing' | 'completed' | 'error';
}

export interface ProcessingStep {
  id: string;
  step: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  message?: string;
  timestamp: string;
}

export interface MLockerManifestItem {
  id: string;
  description: string;
  receptionDate: string;
  status: string;
}

export interface NovaMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  files?: NovaFile[];
  processingSteps?: ProcessingStep[];
  resultData?: ProcessedNovaData | null;
  mlockerManifests?: MLockerManifestItem[];
  firestoreManifestsOnly?: boolean;
}

export interface ProcessedRow {
  tracking: string;
  nombre: string;
  guia: string;
  manifiesto: string;
  peso: number;
  precio: number;
  slCode: string;
  nombreCliente: string;
  ruta: string;
  consolidacion: boolean;
  descripcion: string;
  permisos: boolean;
  pesoRedondeo: number;
  diferenciaRedondeo: number;
  pesoConsolidacion: number;
  precioSinPermiso: number;
  precioConPermiso: number;
  matchScore: number;
  hasPreAlert?: boolean;
  preAlertSlCode?: string;
  preAlertCreatedAt?: string;
  preAlertKey?: string;
  preAlertId?: string;
  originalData: Record<string, unknown>;
}

export type ReviewReason = 'user_choice' | 'low_score' | 'por_definir';

export interface MultiMatchRowData {
  rowIndex: number;
  tracking: string;
  nombre: string;
  needsReview?: ReviewReason;
  matchedSlCode?: string;
  matchedName?: string;
  matchScore?: number;
  peso?: number;
  pesoRedondeo?: number;
  diferenciaRedondeo?: number;
  precioSinPermiso?: number;
  precioConPermiso?: number;
  permisos?: boolean;
  consolidacion?: boolean;
  candidates: Array<{
    slCode: string;
    fullName: string;
    ruta: string;
    consolidation: boolean;
    score: number;
  }>;
}

export interface ProcessedNovaData {
  rows: ProcessedRow[];
  summary: {
    totalRows: number;
    processedRows: number;
    errors: number;
    totalPrice: number;
    customersMatched: number;
    namesCorrections: number;
    weightCorrections: number;
  };
  manifestNumber: string;
  manifestType?: string;
  corrections: Array<{
    field: string;
    original: string;
    corrected: string;
    row: number;
    confidence?: number;
  }>;
  validation?: {
    isValid: boolean;
    issues: Array<{ field: string; type: string; message: string }>;
    suggestions: string[];
  };
  multiMatchRows?: MultiMatchRowData[];
  requiresUserChoice?: boolean;
  exchangeRate?: number;
  aiSuggestions?: {
    unmatchedNames: string[];
    suggestions: string[];
    patterns: string[];
  };
  /**
   * True when this data was loaded from Firestore (existing saved manifest) as
   * opposed to being freshly parsed from an Excel file. Consumers (notably
   * NovaTableModal + useNovaCustomerAssignment) use this to skip the one-shot
   * auto-revalidation rematch — saved assignments must not be silently rewritten
   * just because the manifest name and the stored customerName happen to diverge
   * (e.g. the operator deliberately linked "PAULA UMANA" → "ANA PAULA FONSECA
   * QUADROS" before saving). Re-linking requires an explicit user action.
   */
  loadedFromFirestore?: boolean;
  isMegaMan?: boolean;
  ghostTrackings?: string[];
}

export interface UseNovaChatOptions {
  onError?: (error: Error) => void;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function useNovaChat(options: UseNovaChatOptions = {}) {
  const { language } = useLocale(['nova', 'common']);
  const [messages, setMessages] = useState<NovaMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState<string>('');
  const [processedData, setProcessedData] = useState<ProcessedNovaData | null>(null);

  // Pre-warm learned match cache on mount to eliminate cold-start delay on first manifest
  useEffect(() => {
    warmLearnedCache().catch(() => {/* non-critical */});
  }, []);

  const addMessage = useCallback((message: Omit<NovaMessage, 'id' | 'timestamp'>) => {
    const newMessage: NovaMessage = {
      ...message,
      id: generateId(),
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, newMessage]);
    return newMessage.id;
  }, []);

  const updateMessage = useCallback((id: string, updates: Partial<NovaMessage>) => {
    setMessages(prev => prev.map(msg => 
      msg.id === id ? { ...msg, ...updates } : msg
    ));
  }, []);

  const processFiles = useCallback(async (files: File[], manifestTypeHint?: import('@/lib/services/manifest-processor').ManifestType) => {
    if (files.length === 0) return;

    setIsProcessing(true);
    setProcessedData(null);

    // Create NovaFile objects for display
    const novaFiles: NovaFile[] = files.map((file) => ({
      id: generateId(),
      name: file.name,
      size: file.size,
      type: file.type || getFileType(file.name),
      data: '',
      status: 'pending' as const,
    }));

    // Add user message with files
    addMessage({
      role: 'user',
      content: language === 'es' 
        ? `Procesando ${files.length} archivo(s): ${files.map(f => f.name).join(', ')}`
        : `Processing ${files.length} file(s): ${files.map(f => f.name).join(', ')}`,
      files: novaFiles,
    });

    // Initial processing steps
    const initialSteps: ProcessingStep[] = [
      { id: '1', step: language === 'es' ? 'Leyendo archivo' : 'Reading file', status: 'processing', timestamp: new Date().toISOString() },
      { id: '2', step: language === 'es' ? 'Formateando tracking a UPPERCASE' : 'Formatting tracking to UPPERCASE', status: 'pending', timestamp: '' },
      { id: '3', step: language === 'es' ? 'Formateando nombres a UPPERCASE' : 'Formatting names to UPPERCASE', status: 'pending', timestamp: '' },
      { id: '4', step: language === 'es' ? 'Verificando nombres con IA' : 'Verifying names with AI', status: 'pending', timestamp: '' },
      { id: '5', step: language === 'es' ? 'Eliminando columna número de cliente' : 'Removing customer number column', status: 'pending', timestamp: '' },
      { id: '6', step: language === 'es' ? 'Extrayendo número de manifiesto' : 'Extracting manifest number', status: 'pending', timestamp: '' },
      { id: '7', step: language === 'es' ? 'Calculando precios (USA Aéreo)' : 'Calculating prices (USA Air)', status: 'pending', timestamp: '' },
      { id: '8', step: language === 'es' ? 'Agregando columnas slCode y ruta' : 'Adding slCode and route columns', status: 'pending', timestamp: '' },
      { id: '9', step: language === 'es' ? 'Generando resultado' : 'Generating result', status: 'pending', timestamp: '' },
    ];

    // Add assistant message for processing status
    const assistantMessageId = addMessage({
      role: 'assistant',
      content: language === 'es' ? 'Iniciando procesamiento...' : 'Starting processing...',
      processingSteps: initialSteps,
    });

    try {
      const token = getAuthToken();
      
      // Resolve userId from auth token (best-effort)
      let userId = 'anonymous';
      try {
        const { getAuth } = await import('firebase/auth');
        const user = getAuth().currentUser;
        if (user) userId = user.uid;
      } catch { /* ignore — userId stays 'anonymous' */ }

      // Process each file
      for (const file of files) {
        const result = await processManifestFile(
          file,
          token,
          (steps: ServiceProcessingStep[], currentStepName: string, message?: string) => {
            setCurrentStep(currentStepName);
            // Map service steps to our ProcessingStep type
            const mappedSteps: ProcessingStep[] = steps.map(s => ({
              id: s.id,
              step: s.step,
              status: s.status,
              message: s.message,
              timestamp: s.timestamp,
            }));
            updateMessage(assistantMessageId, {
              content: message || currentStepName,
              processingSteps: mappedSteps,
            });
          },
          manifestTypeHint
        );

        // Fire AI learning report asynchronously — non-blocking
        recordManifestLearning(result, userId).catch(() => { /* silent */ });

        // Persist manifest metadata only — packages are ingested via the explicit
        // "Ingresar" button in NovaMessage which properly passes the exchange rate.
        // Auto-ingesting here without exchangeRate would store costCRC=0 in the DB.
        // MEGA-MAN manifests are never auto-saved on re-process — data is already
        // in Firestore from the original fusion. Only save fresh regular manifests.
        // Note: Auto-saving is now disabled here and deferred to the custom naming modal.
        /*
        const isMM = result.manifestNumber.startsWith('MEGA-MAN-') || result.manifestNumber.startsWith('SL-MEGA-MAN-');
        if (!isMM) {
          saveManifestRecord(result.rows, result.manifestNumber, {
            manifestType: result.manifestType,
            totalPrice: result.summary.totalPrice,
          }).catch(err => console.warn('[Nova] Firestore manifest save failed:', err));
        }
        */

        const processedResult: ProcessedNovaData = {
          rows: result.rows,
          summary: result.summary,
          manifestNumber: result.manifestNumber,
          manifestType: result.manifestType,
          corrections: result.corrections,
          multiMatchRows: result.multiMatchRows,
          requiresUserChoice: result.requiresUserChoice,
          aiSuggestions: result.aiSuggestions,
          exchangeRate: result.exchangeRate,
        };
        
        setProcessedData(processedResult);
        
        // Final update with completed status
        const completedSteps: ProcessingStep[] = initialSteps.map(s => ({
          ...s,
          status: 'completed' as const,
          timestamp: new Date().toISOString(),
        }));
        
        updateMessage(assistantMessageId, {
          content: language === 'es' 
            ? `Procesamiento completado. ${result.summary.processedRows} filas procesadas. Precio total: $${result.summary.totalPrice.toFixed(2)}`
            : `Processing completed. ${result.summary.processedRows} rows processed. Total price: $${result.summary.totalPrice.toFixed(2)}`,
          resultData: processedResult,
          processingSteps: completedSteps,
        });
      }
    } catch (error) {
      console.error('Processing error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      updateMessage(assistantMessageId, {
        content: language === 'es' 
          ? `Error: ${errorMessage}`
          : `Error: ${errorMessage}`,
      });
      
      options.onError?.(error instanceof Error ? error : new Error(errorMessage));
    } finally {
      setIsProcessing(false);
      setCurrentStep('');
    }
  }, [language, addMessage, updateMessage, options]);

  const applyMatchSelection = useCallback(
    (rowIndex: number, slCode: string, ruta: string, consolidacion: boolean, fullName?: string) => {
      // Persist ruta to both SP1 customers + SP2 users in background
      if (slCode && ruta) {
        updateCustomerRuta(slCode, ruta, false, 'nova_chat').catch(err =>
          console.warn('[Nova] ruta sync failed:', err)
        );
      }

      setProcessedData(prev => {
        if (!prev) return prev;
        const rows = prev.rows.map((row, idx) =>
          idx === rowIndex
            ? { ...row, slCode, nombreCliente: fullName || row.nombreCliente || slCode, ruta, consolidacion }
            : row
        );
        const updatedMultiMatchRows = (prev.multiMatchRows ?? []).filter(
          r => r.rowIndex !== rowIndex
        );
        const requiresUserChoice = updatedMultiMatchRows.length > 0;
        const updated: ProcessedNovaData = {
          ...prev,
          rows,
          multiMatchRows: updatedMultiMatchRows,
          requiresUserChoice,
        };
        return updated;
      });
      // Keep message resultData in sync so the UI reflects the selection
      setMessages(prev =>
        prev.map(msg =>
          msg.resultData
            ? {
                ...msg,
                resultData: {
                  ...msg.resultData,
                  rows: msg.resultData.rows.map((row, idx) =>
                    idx === rowIndex
                      ? { ...row, slCode, nombreCliente: fullName || row.nombreCliente || slCode, ruta, consolidacion }
                      : row
                  ),
                  multiMatchRows: (msg.resultData.multiMatchRows ?? []).filter(
                    r => r.rowIndex !== rowIndex
                  ),
                  requiresUserChoice:
                    ((msg.resultData.multiMatchRows ?? []).filter(
                      r => r.rowIndex !== rowIndex
                    ).length > 0),
                },
              }
            : msg
        )
      );
    },
    []
  );

  const loadManifestFromDB = useCallback(async (manifestId: string) => {
    setIsProcessing(true);
    const msgId = addMessage({
      role: 'assistant',
      content: `Cargando ${manifestId} desde Firestore…`,
      processingSteps: [],
    });
    try {
      let result;
      if (typeof window !== 'undefined' && (window as any).__playwright_mock_auth__) {
        result = {
          id: manifestId,
          manifestNumber: manifestId.includes('-2026') ? manifestId : `${manifestId}-2026`,
          manifestType: 'usa_air',
          rows: [
            {
              id: 'pkg-1',
              tracking: 'TRACKING123',
              trackingNumber: 'TRACKING123',
              guia: 'TRACKING123',
              manifiesto: manifestId,
              nombre: 'DANIEL ALONSO ARCE BARBOZA',
              nombreCliente: 'DANIEL ALONSO ARCE BARBOZA',
              slCode: 'SL-4859',
              ruta: 'San José',
              peso: 2.5,
              precio: 15.0,
              pesoRedondeo: 3,
              diferenciaRedondeo: 0.5,
              pesoConsolidacion: 3,
              precioSinPermiso: 15.0,
              precioConPermiso: 15.0,
              matchScore: 1.0,
              matchSource: 'name',
              consolidacion: true,
              descripcion: 'Paquete de prueba',
              permisos: false,
              originalData: {},
            }
          ],
          summary: {
            totalRows: 1,
            totalPrice: 15.0,
            customersMatched: 1,
            namesCorrections: 0,
            weightCorrections: 0,
            processedRows: 1,
          },
          corrections: [],
          multiMatchRows: [],
          requiresUserChoice: false,
        };
      } else {
        result = await loadManifestFromFirestore(manifestId);
      }
      if (!result) throw new Error(`${manifestId} no encontrado en Firestore`);
      const processedResult: ProcessedNovaData = {
        rows:               result.rows,
        summary:            result.summary,
        manifestNumber:     result.manifestNumber,
        manifestType:       result.manifestType as string,
        corrections:        result.corrections,
        multiMatchRows:     result.multiMatchRows,
        requiresUserChoice: result.requiresUserChoice,
        // Tag the payload as Firestore-loaded so the table modal skips the
        // reactive auto-rematch that would otherwise rewrite saved assignments
        // whose manifest name diverges from the stored customerName.
        loadedFromFirestore: true,
        ...(result.exchangeRate ? { exchangeRate: result.exchangeRate } : {}),
      };
      setProcessedData(processedResult);
      updateMessage(msgId, {
        content:    `✓ Carga de datos completa desde ${result.manifestNumber || manifestId} — ${result.rows.length} paquetes. Revisa y guarda en DB cuando estés listo.`,
        resultData: processedResult,
      });
    } catch (err) {
      updateMessage(msgId, { content: `Error: ${err instanceof Error ? err.message : String(err)}` });
      options.onError?.(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsProcessing(false);
    }
  }, [addMessage, updateMessage, options]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setProcessedData(null);
    setCurrentStep('');
    setIsProcessing(false);
  }, []);

  const injectManualData = useCallback((data: ProcessedNovaData) => {
    setProcessedData(data);
  }, []);

  const buildServiceResult = useCallback((data: ProcessedNovaData) => ({
    rows: data.rows,
    summary: data.summary,
    manifestNumber: data.manifestNumber,
    manifestType: (data.manifestType || 'usa_air') as any,
    corrections: data.corrections,
    validation: data.validation || { isValid: true, issues: [], suggestions: [] },
    multiMatchRows: data.multiMatchRows || [],
    requiresUserChoice: data.requiresUserChoice || false,
    exchangeRate: data.exchangeRate,
  }), []);

  const downloadCSV = useCallback(() => {
    if (!processedData) return;
    downloadCSVFile(buildServiceResult(processedData));
  }, [processedData, buildServiceResult]);

  const downloadXLSX = useCallback(() => {
    if (!processedData) return;
    downloadXLSXFile(buildServiceResult(processedData));
  }, [processedData, buildServiceResult]);

  return {
    messages,
    isProcessing,
    currentStep,
    processedData,
    setProcessedData,
    processFiles,
    loadManifestFromDB,
    clearMessages,
    downloadCSV,
    downloadXLSX,
    applyMatchSelection,
    injectManualData,
  };
}

// Helper function
function getFileType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'xls':
      return 'application/vnd.ms-excel';
    case 'csv':
      return 'text/csv';
    default:
      return 'application/octet-stream';
  }
}
