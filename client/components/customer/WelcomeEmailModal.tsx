import { useState, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Mail, Send, Loader2, CheckCircle2, AlertCircle, Eye, FileText, ExternalLink, Video, Save } from "lucide-react";
import { sendWelcomeCustomerEmail, buildWelcomeEmailHtml, WelcomeEmailCustomerData } from "@/lib/services/resend-email.service";

export interface WelcomeCustomerTarget {
  id: string;
  fullName: string;
  email: string;
  slCode?: string;
}

interface WelcomeEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  targets: WelcomeCustomerTarget[];
  onSuccess?: () => void;
}

const TEMPLATE_STORAGE_KEY = "sl_welcome_email_template_v2";

export function WelcomeEmailModal({
  isOpen,
  onClose,
  targets,
  onSuccess,
}: WelcomeEmailModalProps) {
  const { toast } = useToast();
  const [heroTitle, setHeroTitle] = useState("¡Bienvenido a SmartLogistics!");
  const [heroSubtitle, setHeroSubtitle] = useState("Tu casillero y portal de entregas internacionales ha sido activado con éxito.");
  const [customNote, setCustomNote] = useState("");
  const [videoUrl, setVideoUrl] = useState("https://www.youtube.com/shorts/UfI309_tPS4");
  const [videoTitle, setVideoTitle] = useState("▶ ¿Cómo funciona tu casillero? (Ver Video)");
  const [videoUrl2, setVideoUrl2] = useState("https://www.youtube.com/watch?v=oTo8yYFYdKM");
  const [videoTitle2, setVideoTitle2] = useState("▶ Tutorial de Envíos y Compras Paso a Paso");
  const [guideUrl, setGuideUrl] = useState("");
  const [guideTitle, setGuideTitle] = useState("📄 Ver Guía Digital de Envíos");

  const [activeTab, setActiveTab] = useState<"form" | "preview">("form");
  const [isSending, setIsSending] = useState(false);
  const [progress, setProgress] = useState<{ completed: number; total: number; successCount: number; failCount: number } | null>(null);

  // Load saved template on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(TEMPLATE_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.heroTitle) setHeroTitle(parsed.heroTitle);
        if (parsed.heroSubtitle) setHeroSubtitle(parsed.heroSubtitle);
        if (parsed.customNote !== undefined) setCustomNote(parsed.customNote);
        setVideoUrl(parsed.videoUrl?.trim() || "https://www.youtube.com/shorts/UfI309_tPS4");
        setVideoTitle(parsed.videoTitle?.trim() || "▶ ¿Cómo funciona tu casillero? (Ver Video)");
        setVideoUrl2(parsed.videoUrl2?.trim() || "https://www.youtube.com/watch?v=oTo8yYFYdKM");
        setVideoTitle2(parsed.videoTitle2?.trim() || "▶ Tutorial de Envíos y Compras Paso a Paso");
        if (parsed.guideUrl !== undefined) setGuideUrl(parsed.guideUrl);
        if (parsed.guideTitle) setGuideTitle(parsed.guideTitle);
      }
    } catch (err) {
      console.warn("Failed to load welcome email template from localStorage:", err);
    }
  }, []);

  const handleSaveTemplate = () => {
    try {
      const templateData = {
        heroTitle,
        heroSubtitle,
        customNote,
        videoUrl,
        videoTitle,
        videoUrl2,
        videoTitle2,
        guideUrl,
        guideTitle,
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(templateData));
      toast({
        title: "Plantilla guardada",
        description: "Los textos y enlaces de los 2 videos de YouTube y guía se han guardado como plantilla predeterminada.",
      });
    } catch (err) {
      toast({
        title: "Error",
        description: "No se pudo guardar la plantilla.",
        variant: "destructive",
      });
    }
  };

  const isBulk = targets.length > 1;
  const singleTarget = targets[0] || null;

  const previewName = singleTarget?.fullName || "Andrés Varela Solís";
  const previewEmail = singleTarget?.email || "cliente@ejemplo.com";
  const previewSlCode = singleTarget?.slCode || "SL261944";

  const handleSend = useCallback(async () => {
    if (targets.length === 0) return;
    setIsSending(true);
    let successCount = 0;
    let failCount = 0;

    setProgress({ completed: 0, total: targets.length, successCount: 0, failCount: 0 });

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      if (!target.email) {
        failCount++;
        setProgress({ completed: i + 1, total: targets.length, successCount, failCount });
        continue;
      }

      const emailData: WelcomeEmailCustomerData = {
        customerId: target.id,
        email: target.email,
        fullName: target.fullName || "Cliente",
        slCode: target.slCode,
        customMessage: customNote.trim() || undefined,
        heroTitle: heroTitle.trim() || undefined,
        heroSubtitle: heroSubtitle.trim() || undefined,
        videoUrl: videoUrl.trim() || undefined,
        videoTitle: videoTitle.trim() || undefined,
        videoUrl2: videoUrl2.trim() || undefined,
        videoTitle2: videoTitle2.trim() || undefined,
        guideUrl: guideUrl.trim() || undefined,
        guideTitle: guideTitle.trim() || undefined,
      };

      const result = await sendWelcomeCustomerEmail(emailData);
      if (result.success) {
        successCount++;
      } else {
        failCount++;
      }

      setProgress({ completed: i + 1, total: targets.length, successCount, failCount });

      if (i < targets.length - 1) {
        await new Promise((r) => setTimeout(r, 400));
      }
    }

    setIsSending(false);

    if (successCount > 0) {
      toast({
        title: "Correo de bienvenida enviado",
        description: isBulk
          ? `Se enviaron exitosamente ${successCount} de ${targets.length} correos.`
          : `Correo enviado a ${singleTarget?.email}`,
      });
      if (onSuccess) onSuccess();
      onClose();
    } else {
      toast({
        title: "Error al enviar",
        description: "No se pudo enviar el correo de bienvenida. Verifica la dirección de correo.",
        variant: "destructive",
      });
    }
  }, [targets, customNote, heroTitle, heroSubtitle, videoUrl, videoTitle, guideUrl, guideTitle, isBulk, singleTarget, toast, onSuccess, onClose]);

  const handleClose = () => {
    if (isSending) return;
    setProgress(null);
    setActiveTab("form");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <Mail className="h-5 w-5 text-primary" />
            {isBulk ? "Enviar correos de bienvenida" : "Enviar correo de bienvenida"}
          </DialogTitle>
          <DialogDescription>
            {isBulk
              ? `Enviarás el correo de bienvenida a ${targets.length} clientes seleccionados o registrados en la fecha.`
              : "Envía los accesos e información de casillero al cliente con vista previa en vivo."}
          </DialogDescription>
        </DialogHeader>

        {/* Tab switch on mobile / dual column on desktop */}
        <div className="py-2">
          <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as any)} className="w-full">
            <TabsList className="grid w-full grid-cols-2 md:hidden mb-3">
              <TabsTrigger value="form" className="gap-1.5 text-xs">
                <FileText className="h-3.5 w-3.5" />
                Configurar
              </TabsTrigger>
              <TabsTrigger value="preview" className="gap-1.5 text-xs">
                <Eye className="h-3.5 w-3.5" />
                Vista Previa
              </TabsTrigger>
            </TabsList>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
              {/* Form Column */}
              <div className={`space-y-4 md:col-span-5 ${activeTab === "form" ? "block" : "hidden md:block"}`}>
                {!isBulk && singleTarget && (
                  <div className="rounded-lg border bg-muted/30 p-3.5 text-sm space-y-1 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-gray-900 dark:text-white truncate pr-2">{singleTarget.fullName}</span>
                      {singleTarget.slCode && (
                        <Badge variant="outline" className="font-mono text-xs shrink-0 bg-primary/5 text-primary border-primary/20">
                          {singleTarget.slCode}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{singleTarget.email || "Sin correo electrónico registrado"}</p>
                  </div>
                )}

                {isBulk && (
                  <div className="rounded-lg border bg-blue-50/60 dark:bg-blue-950/30 p-3 text-xs text-blue-800 dark:text-blue-200">
                    Se enviará un correo personalizado con los datos de casillero a cada uno de los <strong>{targets.length} clientes</strong>.
                  </div>
                )}

                <div className="space-y-3 border-b pb-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Editor de Plantilla</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleSaveTemplate}
                      className="h-7 text-xs gap-1 text-primary hover:bg-primary/10"
                      title="Guardar esta configuración como predeterminada"
                    >
                      <Save className="h-3.5 w-3.5" />
                      <span>Guardar plantilla</span>
                    </Button>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="hero-title" className="text-[11px] font-medium text-muted-foreground">Título de Encabezado</Label>
                    <Input
                      id="hero-title"
                      value={heroTitle}
                      onChange={(e) => setHeroTitle(e.target.value)}
                      placeholder="¡Bienvenido a SmartLogistics!"
                      className="h-8 text-xs"
                      disabled={isSending}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="hero-subtitle" className="text-[11px] font-medium text-muted-foreground">Subtítulo de Encabezado</Label>
                    <Input
                      id="hero-subtitle"
                      value={heroSubtitle}
                      onChange={(e) => setHeroSubtitle(e.target.value)}
                      placeholder="Tu casillero y portal de entregas internacionales..."
                      className="h-8 text-xs"
                      disabled={isSending}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="custom-note" className="text-xs font-semibold flex items-center justify-between">
                    <span>Mensaje personalizado adicional</span>
                    <span className="text-[10px] text-muted-foreground font-normal">Vista previa en vivo</span>
                  </Label>
                  <Textarea
                    id="custom-note"
                    placeholder="Escribe un mensaje o indicaciones específicas del equipo para el cliente..."
                    value={customNote}
                    onChange={(e) => setCustomNote(e.target.value)}
                    rows={3}
                    disabled={isSending}
                    className="text-xs resize-none"
                  />
                </div>

                {/* Video & Guide Links Section */}
                <div className="space-y-2 border-t pt-2.5">
                  <span className="text-[11px] font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1">
                    <Video className="h-3.5 w-3.5 text-red-500" />
                    Videos Instructivos de YouTube & Guía Digital (Editables)
                  </span>

                  <div className="grid grid-cols-1 gap-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      <div className="space-y-0.5">
                        <Label htmlFor="video-url-1" className="text-[10px] text-muted-foreground font-medium">URL Video 1 (Shorts / YouTube)</Label>
                        <Input
                          id="video-url-1"
                          value={videoUrl}
                          onChange={(e) => setVideoUrl(e.target.value)}
                          placeholder="https://www.youtube.com/shorts/UfI309_tPS4"
                          className="h-7 text-[11px]"
                          disabled={isSending}
                        />
                      </div>
                      <div className="space-y-0.5">
                        <Label htmlFor="video-title-1" className="text-[10px] text-muted-foreground font-medium">Texto Botón Video 1</Label>
                        <Input
                          id="video-title-1"
                          value={videoTitle}
                          onChange={(e) => setVideoTitle(e.target.value)}
                          placeholder="▶ ¿Cómo funciona tu casillero? (Ver Video)"
                          className="h-7 text-[11px]"
                          disabled={isSending}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      <div className="space-y-0.5">
                        <Label htmlFor="video-url-2" className="text-[10px] text-muted-foreground font-medium">URL Video 2 (YouTube)</Label>
                        <Input
                          id="video-url-2"
                          value={videoUrl2}
                          onChange={(e) => setVideoUrl2(e.target.value)}
                          placeholder="https://www.youtube.com/watch?v=oTo8yYFYdKM"
                          className="h-7 text-[11px]"
                          disabled={isSending}
                        />
                      </div>
                      <div className="space-y-0.5">
                        <Label htmlFor="video-title-2" className="text-[10px] text-muted-foreground font-medium">Texto Botón Video 2</Label>
                        <Input
                          id="video-title-2"
                          value={videoTitle2}
                          onChange={(e) => setVideoTitle2(e.target.value)}
                          placeholder="▶ Tutorial de Envíos y Compras Paso a Paso"
                          className="h-7 text-[11px]"
                          disabled={isSending}
                        />
                      </div>
                    </div>

                    <div className="space-y-0.5 pt-0.5">
                      <Label htmlFor="guide-url" className="text-[10px] text-muted-foreground font-medium">URL de Guía Digital (Opcional)</Label>
                      <Input
                        id="guide-url"
                        value={guideUrl}
                        onChange={(e) => setGuideUrl(e.target.value)}
                        placeholder="https://smartlogisticscr.com/guia"
                        className="h-7 text-[11px]"
                        disabled={isSending}
                      />
                    </div>
                  </div>
                </div>

                {progress && (
                  <div className="space-y-2 rounded-lg border bg-muted/40 p-3 text-xs">
                    <div className="flex items-center justify-between font-medium">
                      <span>Progreso: {progress.completed} / {progress.total}</span>
                      <span className="text-muted-foreground">
                        {Math.round((progress.completed / progress.total) * 100)}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${(progress.completed / progress.total) * 100}%` }}
                      />
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground pt-1">
                      <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" /> {progress.successCount} exitosos
                      </span>
                      {progress.failCount > 0 && (
                        <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                          <AlertCircle className="h-3 w-3" /> {progress.failCount} fallidos
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Email Preview Column */}
              <div className={`space-y-2 md:col-span-7 ${activeTab === "preview" ? "block" : "hidden md:block"}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                    <Eye className="h-3.5 w-3.5 text-primary" />
                    Vista previa en vivo del correo
                  </span>
                  <Badge variant="outline" className="text-[10px] bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 border-emerald-200">
                    Resend Ready
                  </Badge>
                </div>

                {/* Email Mock Container */}
                <div className="rounded-lg border bg-slate-900 text-slate-100 shadow-md text-xs overflow-hidden">
                  {/* Email Header */}
                  <div className="bg-slate-800 p-2.5 space-y-1 text-[11px] border-b border-slate-700">
                    <div className="flex items-center gap-1 text-slate-400">
                      <span className="font-semibold text-slate-300">De:</span> SmartLogistics &lt;notificaciones@smartlogisticscr.com&gt;
                    </div>
                    <div className="flex items-center gap-1 text-slate-400">
                      <span className="font-semibold text-slate-300">Para:</span> {previewEmail}
                    </div>
                    <div className="flex items-center gap-1 text-slate-300 font-medium pt-0.5 truncate">
                      <span className="font-semibold text-slate-400">Asunto:</span> ¡Bienvenido a SmartLogistics! {previewSlCode ? `— Casillero ${previewSlCode}` : ""}
                    </div>
                  </div>

                  {/* Rendered Invoice-Branded HTML Email Content */}
                  <div className="bg-slate-100 p-0 overflow-hidden">
                    <iframe
                      srcDoc={buildWelcomeEmailHtml({
                        customerId: singleTarget?.id || "preview",
                        email: previewEmail,
                        fullName: previewName,
                        slCode: previewSlCode,
                        customMessage: customNote,
                        heroTitle: heroTitle,
                        heroSubtitle: heroSubtitle,
                        videoUrl: videoUrl,
                        videoTitle: videoTitle,
                        videoUrl2: videoUrl2,
                        videoTitle2: videoTitle2,
                        guideUrl: guideUrl,
                        guideTitle: guideTitle,
                      })}
                      className="w-full h-[380px] border-0 bg-white"
                      title="Vista Previa de Correo"
                    />
                  </div>
                </div>
              </div>
            </div>
          </Tabs>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 border-t pt-3">
          <Button type="button" variant="outline" onClick={handleClose} disabled={isSending}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSend}
            disabled={isSending || targets.length === 0 || (!isBulk && !singleTarget?.email)}
            className="gap-2"
          >
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                {isBulk ? `Enviar a los ${targets.length} clientes` : "Enviar correo"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
