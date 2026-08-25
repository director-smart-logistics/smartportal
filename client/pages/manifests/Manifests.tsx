import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { useToast } from '@/hooks/use-toast';
import { useNovaChat } from '@/hooks/use-nova-chat';
import { ResultSummary } from '@/components/nova/NovaMessage';
import { StepOrigin } from '@/components/manifest-wizard/StepOrigin';
import { StepUpload } from '@/components/manifest-wizard/StepUpload';
import { cn } from '@/lib/utils';
import { Check, RotateCcw } from 'lucide-react';
import { saveManifestRecord, type ManifestType } from '@/lib/services/manifest-processor';
import { NovaManifestNamePromptModal } from '@/components/nova/NovaManifestNamePromptModal';

type WizardStep = 'origin' | 'upload' | 'review';

const STEP_META: { id: WizardStep; label: string }[] = [
  { id: 'origin', label: 'Origen' },
  { id: 'upload', label: 'Archivo' },
  { id: 'review', label: 'Revisión' },
];

export default function Manifests() {
  const { toast } = useToast();
  const [step, setStep] = useState<WizardStep>('origin');
  const [manifestType, setManifestType] = useState<ManifestType | null>(null);

  const {
    messages,
    isProcessing,
    currentStep: processingStep,
    processedData,
    setProcessedData,
    processFiles,
    clearMessages,
    downloadCSV,
    downloadXLSX,
    applyMatchSelection,
    injectManualData,
  } = useNovaChat({
    onError: useCallback(
      (error: Error) => {
        toast({
          title: 'Error',
          description: error.message,
          variant: 'destructive',
        });
      },
      [toast]
    ),
  });

  const currentStepIndex = STEP_META.findIndex(s => s.id === step);

  // Find the latest assistant message with processing steps for upload progress
  const latestProcessingMessage = useMemo(
    () => [...messages].reverse().find(m => m.role === 'assistant' && m.processingSteps),
    [messages]
  );

  // Step 1: Origin selected → go to upload
  const handleOriginSelect = useCallback((type: ManifestType) => {
    setManifestType(type);
    setStep('upload');
  }, []);

  // Step 2: Files selected → process with Nova engine
  const handleFilesSelected = useCallback((files: File[]) => {
    processFiles(files, manifestType ?? undefined);
  }, [processFiles, manifestType]);

  const handleManualSubmit = useCallback((data: any) => {
    injectManualData(data);
    setStep('review');
  }, [injectManualData]);

  const [showNameModal, setShowNameModal] = useState(false);

  // Open custom naming modal when processing completes
  const wasProcessingRef = useRef(false);
  useEffect(() => {
    if (wasProcessingRef.current && !isProcessing && processedData && step === 'upload') {
      setShowNameModal(true);
    }
    wasProcessingRef.current = isProcessing;
  }, [isProcessing, processedData, step]);

  const handleConfirmName = useCallback(async (confirmedName: string) => {
    if (!processedData) return;

    // Update row manifiesto fields to match confirmed custom name
    const updatedRows = processedData.rows.map(row => ({
      ...row,
      manifiesto: confirmedName,
    }));

    const updatedData = {
      ...processedData,
      rows: updatedRows,
      manifestNumber: confirmedName,
    };

    setProcessedData(updatedData);

    // Save manifest record to Firestore now!
    await saveManifestRecord(updatedRows, confirmedName, {
      manifestType: manifestType ?? 'usa_air',
      totalPrice: processedData.summary.totalPrice,
      exchangeRate: processedData.exchangeRate,
    });

    setStep('review');
    setShowNameModal(false);
  }, [processedData, manifestType, setProcessedData]);

  const handleCancelName = useCallback(() => {
    setShowNameModal(false);
    clearMessages();
  }, [clearMessages]);

  // Reset wizard
  const handleReset = useCallback(() => {
    clearMessages();
    setStep('origin');
    setManifestType(null);
  }, [clearMessages]);

  // Go back to previous step
  const handleBackToOrigin = useCallback(() => {
    if (!isProcessing) {
      clearMessages();
      setStep('origin');
      setManifestType(null);
    }
  }, [isProcessing, clearMessages]);

  return (
    <DashboardLayout hideBreadcrumb>
      <div className="relative flex flex-col h-[calc(100vh-4rem)] bg-background overflow-hidden">

        {/* ── Minimal top progress bar ── */}
        <div className="shrink-0 flex items-center justify-between px-4 sm:px-6 h-12 border-b border-border">
          {/* Step indicators */}
          <div className="flex items-center gap-1">
            {STEP_META.map((s, idx) => {
              const isActive = step === s.id;
              const isCompleted = idx < currentStepIndex;
              return (
                <div key={s.id} className="flex items-center">
                  <button
                    type="button"
                    onClick={() => {
                      if (isCompleted && !isProcessing) {
                        if (idx === 0) handleBackToOrigin();
                        else setStep(s.id);
                      }
                    }}
                    disabled={!isCompleted || isProcessing}
                    className={cn(
                      'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all',
                      isActive && 'text-white',
                      isCompleted && 'text-foreground hover:bg-gray-100 cursor-pointer',
                      !isActive && !isCompleted && 'text-muted-foreground/50 cursor-default'
                    )}
                    style={isActive ? { background: 'hsl(var(--manifest-brand))' } : undefined}
                  >
                    {isCompleted ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <span className="w-4 h-4 rounded-full border flex items-center justify-center text-[10px]"
                        style={isActive ? { borderColor: 'transparent' } : undefined}
                      >
                        {idx + 1}
                      </span>
                    )}
                    <span className="hidden sm:inline">{s.label}</span>
                  </button>
                  {idx < STEP_META.length - 1 && (
                    <div className={cn(
                      'w-6 h-px mx-1',
                      idx < currentStepIndex ? 'bg-foreground/20' : 'bg-gray-200'
                    )} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Right side actions */}
          <div className="flex items-center gap-2">
            {step !== 'origin' && (
              <button
                type="button"
                onClick={handleReset}
                disabled={isProcessing}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-gray-100 transition-colors disabled:opacity-40"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Nuevo</span>
              </button>
            )}
          </div>
        </div>

        {/* ── Step content ── */}
        <div className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            {/* ── STEP 1: Origin Selection ── */}
            {step === 'origin' && (
              <motion.div
                key="origin"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, x: -40 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="h-full"
              >
                <StepOrigin onSelect={handleOriginSelect} />
              </motion.div>
            )}

            {/* ── STEP 2: File Upload + AI Processing ── */}
            {step === 'upload' && manifestType && (
              <motion.div
                key="upload"
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="h-full"
              >
                <StepUpload
                  manifestType={manifestType}
                  isProcessing={isProcessing}
                  processingSteps={latestProcessingMessage?.processingSteps}
                  currentStep={processingStep}
                  onFilesSelected={handleFilesSelected}
                  onManualSubmit={handleManualSubmit}
                  onBack={handleBackToOrigin}
                />
              </motion.div>
            )}

            {/* ── STEP 3: Data Review (table directly, no chat wrapper) ── */}
            {step === 'review' && processedData && (
              <motion.div
                key="review"
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="h-full"
              >
                <ResultSummary
                  resultData={processedData}
                  onDownload={downloadCSV}
                  onDownloadXLSX={downloadXLSX}
                  onSelectMatch={applyMatchSelection}
                  initialExchangeRate={processedData.exchangeRate ? String(processedData.exchangeRate) : undefined}
                  embedMode
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <NovaManifestNamePromptModal
        isOpen={showNameModal}
        defaultName={processedData?.manifestNumber || ''}
        onConfirm={handleConfirmName}
        onCancel={handleCancelName}
      />
    </DashboardLayout>
  );
}
