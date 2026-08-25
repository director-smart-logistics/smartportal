import { useState, useMemo } from "react";
import {
  AlertCircle,
  Check,
  FolderOpen,
  Link2,
  Loader2,
  Sparkles,
  Unlink2,
  X,
  Move,
  Search,
  GripVertical,
  Users,
  Hash,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface UnlinkActionModalState {
  indices: number[];
  groupName: string;
}

export interface GroupInfo {
  key: string;
  name: string;
  slCode?: string;
  /** Effective delivery route for the group — inherited by rows moved here. */
  ruta?: string;
  rowCount: number;
  isMatched: boolean;
}

interface Feedback {
  type: "success" | "error";
  message: string;
}

interface NovaUnlinkActionModalProps {
  state: UnlinkActionModalState | null;
  getRowName: (idx: number) => string;
  availableGroups?: GroupInfo[];
  onClose: () => void;
  onUnlinkOnly: (indices: number[]) => void;
  onUnlinkAndRematch: (
    indices: number[],
    getNombre: (idx: number) => string,
  ) => Promise<void>;
  onAssignClient: (indices: number[], nombre: string) => void;
  onMoveToGroup?: (indices: number[], targetGroupKey: string) => void;
}

interface ActionOptionProps {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
  disabled: boolean;
  onClick: () => void;
}

function ActionOption({
  icon,
  iconBg,
  title,
  description,
  disabled,
  onClick,
}: ActionOptionProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "group w-full flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3.5",
        "text-left transition-all duration-150",
        "hover:border-primary/40 hover:bg-accent/60 hover:shadow-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-card disabled:hover:border-border disabled:hover:shadow-none",
      )}
    >
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
          iconBg,
        )}
      >
        {icon}
      </div>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-sm font-semibold text-foreground leading-snug">
          {title}
        </span>
        <span className="text-xs text-muted-foreground leading-snug">
          {description}
        </span>
      </div>
    </button>
  );
}

// Simple fuzzy match algorithm for name similarity
function fuzzyNameSimilarity(a: string, b: string): number {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (na.length === 0 || nb.length === 0) return 0;

  // Check if one contains the other
  if (na.includes(nb) || nb.includes(na)) return 0.85;

  // Check first word match
  const firstA = na.split(/\s+/)[0];
  const firstB = nb.split(/\s+/)[0];
  if (firstA === firstB && firstA.length > 2) return 0.7;

  // Check for common subsequences
  let matches = 0;
  let j = 0;
  for (let i = 0; i < na.length && j < nb.length; i++) {
    if (na[i] === nb[j]) {
      matches++;
      j++;
    }
  }
  return matches / Math.max(na.length, nb.length);
}

interface GroupSelectorProps {
  currentName: string;
  groups: GroupInfo[];
  onSelect: (groupKey: string) => void;
  onCancel: () => void;
  isProcessing: boolean;
}

function GroupSelector({
  currentName,
  groups,
  onSelect,
  onCancel,
  isProcessing,
}: GroupSelectorProps) {
  const [search, setSearch] = useState("");
  const [draggedGroup, setDraggedGroup] = useState<string | null>(null);

  const normalizedSearch = search.toLowerCase().trim();

  // Filter and sort groups by relevance
  const filteredGroups = useMemo(() => {
    let filtered = groups;

    if (normalizedSearch) {
      filtered = groups.filter(
        (g) =>
          g.name.toLowerCase().includes(normalizedSearch) ||
          g.slCode?.toLowerCase().includes(normalizedSearch),
      );
    }

    // Sort by similarity to current name + search relevance
    return filtered
      .map((g) => ({
        ...g,
        similarity: fuzzyNameSimilarity(currentName, g.name),
        searchScore: normalizedSearch
          ? (g.name.toLowerCase().includes(normalizedSearch) ? 2 : 0) +
            (g.slCode?.toLowerCase().includes(normalizedSearch) ? 1 : 0)
          : 0,
      }))
      .sort((a, b) => {
        // Priority: exact search match > high similarity > search score > name
        if (a.searchScore !== b.searchScore)
          return b.searchScore - a.searchScore;
        if (Math.abs(a.similarity - b.similarity) > 0.1)
          return b.similarity - a.similarity;
        return a.name.localeCompare(b.name);
      });
  }, [groups, normalizedSearch, currentName]);

  const suggestedGroups = filteredGroups.filter((g) => g.similarity >= 0.6);
  const otherGroups = filteredGroups.filter((g) => g.similarity < 0.6);

  const GroupCard = ({
    group,
    isSuggested,
  }: {
    group: (typeof filteredGroups)[0];
    isSuggested?: boolean;
  }) => (
    <div
      draggable
      onDragStart={() => setDraggedGroup(group.key)}
      onDragEnd={() => setDraggedGroup(null)}
      onClick={() => !isProcessing && onSelect(group.key)}
      className={cn(
        "group flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
        "hover:border-primary/50 hover:bg-accent/50 hover:shadow-sm",
        "active:scale-[0.98]",
        isSuggested &&
          "border-amber-200 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/20",
        draggedGroup === group.key && "opacity-50",
        isProcessing && "opacity-50 cursor-not-allowed",
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
          group.isMatched
            ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
        )}
      >
        {group.isMatched ? (
          <Hash className="h-4 w-4" />
        ) : (
          <Users className="h-4 w-4" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{group.name}</span>
          {isSuggested && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 font-medium">
              {Math.round(group.similarity * 100)}% match
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {group.slCode && <span className="font-mono">{group.slCode}</span>}
          <span>
            {group.rowCount} paquete{group.rowCount !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
      <GripVertical className="h-4 w-4 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Search header */}
      <div className="flex items-center gap-2">
        <Move className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Mover a grupo existente</span>
      </div>

      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre o SL code..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          disabled={isProcessing}
        />
      </div>

      {/* Source indicator */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 p-2 rounded-md">
        <span>Moviendo:</span>
        <span className="font-medium text-foreground">{currentName}</span>
        <ArrowRight className="h-3 w-3" />
        <span className="text-muted-foreground">selecciona destino</span>
      </div>

      {/* Suggested groups */}
      {suggestedGroups.length > 0 && !normalizedSearch && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
              Sugerencias por coincidencia de nombre
            </span>
          </div>
          <div className="space-y-2">
            {suggestedGroups.map((group) => (
              <GroupCard key={group.key} group={group} isSuggested />
            ))}
          </div>
        </div>
      )}

      {/* All/Filtered groups */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            {normalizedSearch
              ? `${filteredGroups.length} resultado${filteredGroups.length !== 1 ? "s" : ""}`
              : "Todos los grupos"}
          </span>
          <span className="text-[10px] text-muted-foreground">
            Arrastra o haz click para seleccionar
          </span>
        </div>
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {otherGroups.length === 0 && suggestedGroups.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              {normalizedSearch
                ? "No se encontraron grupos"
                : "No hay otros grupos disponibles"}
            </div>
          ) : (
            otherGroups.map((group) => (
              <GroupCard key={group.key} group={group} />
            ))
          )}
        </div>
      </div>

      {/* Cancel button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onCancel}
        disabled={isProcessing}
        className="w-full"
      >
        Volver a opciones
      </Button>
    </div>
  );
}

export function NovaUnlinkActionModal({
  state,
  getRowName,
  availableGroups = [],
  onClose,
  onUnlinkOnly,
  onUnlinkAndRematch,
  onAssignClient,
  onMoveToGroup,
}: NovaUnlinkActionModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [showGroupSelector, setShowGroupSelector] = useState(false);

  const handleClose = () => {
    if (isProcessing) return;
    setFeedback(null);
    setShowGroupSelector(false);
    onClose();
  };

  if (!state) return null;

  const singleName = getRowName(state.indices[0]) || state.groupName;
  const count = state.indices.length;

  // Filter out the current group from available groups
  const otherGroups = availableGroups.filter((g) => g.name !== state.groupName);

  const handleMoveToGroup = async (targetGroupKey: string) => {
    if (!onMoveToGroup) return;
    setIsProcessing(true);
    try {
      onMoveToGroup(state.indices, targetGroupKey);
      setFeedback({
        type: "success",
        message: `${count} fila(s) movida(s) al grupo seleccionado.`,
      });
      setTimeout(() => {
        setFeedback(null);
        setIsProcessing(false);
        onClose();
      }, 600);
    } catch {
      setFeedback({
        type: "error",
        message: "Error al mover al grupo. Intenta nuevamente.",
      });
      setIsProcessing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="unlink-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-card border border-border shadow-2xl flex flex-col gap-0 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-3">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-950/40">
              <Unlink2 className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            </div>
            <div className="flex flex-col gap-0.5">
              <h2
                id="unlink-modal-title"
                className="text-base font-semibold text-foreground leading-snug"
              >
                Desvincular tracking
              </h2>
              <p className="text-xs text-muted-foreground leading-snug">
                {count === 1 ? (
                  <>
                    <span className="font-medium text-foreground">
                      &quot;{singleName}&quot;
                    </span>{" "}
                    — elige cómo proceder
                  </>
                ) : (
                  <>
                    <span className="font-medium text-foreground">
                      {count} trackings
                    </span>{" "}
                    del grupo &quot;{state.groupName}&quot;
                  </>
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isProcessing}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Inline feedback */}
        {feedback && (
          <div
            className={cn(
              "mx-5 mb-2 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium animate-in fade-in slide-in-from-top-1",
              feedback.type === "success"
                ? "bg-green-50 text-green-700 border border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800"
                : "bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800",
            )}
          >
            {feedback.type === "success" ? (
              <Check className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            )}
            {feedback.message}
          </div>
        )}

        {/* Options or Group Selector */}
        <div className="flex flex-col gap-2 px-5 pb-3">
          {showGroupSelector ? (
            <GroupSelector
              currentName={singleName}
              groups={otherGroups}
              onSelect={handleMoveToGroup}
              onCancel={() => setShowGroupSelector(false)}
              isProcessing={isProcessing}
            />
          ) : (
            <>
              <ActionOption
                icon={
                  <FolderOpen className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                }
                iconBg="bg-slate-100 dark:bg-slate-800"
                title="Crear grupo separado"
                description="Desvincula y crea un grupo nuevo sin búsqueda automática de cliente."
                disabled={isProcessing}
                onClick={() => {
                  setIsProcessing(true);
                  onUnlinkOnly(state.indices);
                  setFeedback({
                    type: "success",
                    message: `${count} fila(s) desvinculada(s). Grupo creado.`,
                  });
                  setTimeout(() => {
                    setFeedback(null);
                    setIsProcessing(false);
                    onClose();
                  }, 600);
                }}
              />

              <ActionOption
                icon={
                  isProcessing ? (
                    <Loader2 className="h-4 w-4 text-violet-600 dark:text-violet-400 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                  )
                }
                iconBg="bg-violet-100 dark:bg-violet-950/40"
                title="Match automático con Nova"
                description="Nova busca el cliente correcto (umbral 0.85). Si no hay match, crea un grupo separado."
                disabled={isProcessing}
                onClick={async () => {
                  setIsProcessing(true);
                  setFeedback(null);
                  try {
                    await onUnlinkAndRematch(state.indices, getRowName);
                    setFeedback({
                      type: "success",
                      message: "Match completado. Revisa el grupo resultante.",
                    });
                    setTimeout(() => {
                      setFeedback(null);
                      onClose();
                    }, 800);
                  } catch {
                    setFeedback({
                      type: "error",
                      message:
                        "Error en match automático. Intenta asociar manualmente.",
                    });
                  } finally {
                    setIsProcessing(false);
                  }
                }}
              />

              <ActionOption
                icon={
                  <Link2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                }
                iconBg="bg-blue-100 dark:bg-blue-950/40"
                title="Asociar con cliente"
                description="Busca y selecciona manualmente el cliente correcto."
                disabled={isProcessing}
                onClick={() => {
                  onUnlinkOnly(state.indices);
                  onAssignClient(state.indices, singleName);
                  setFeedback(null);
                  onClose();
                }}
              />

              {otherGroups.length > 0 && onMoveToGroup && (
                <ActionOption
                  icon={
                    <Move className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  }
                  iconBg="bg-emerald-100 dark:bg-emerald-950/40"
                  title="Mover a grupo existente"
                  description={`Busca entre ${otherGroups.length} grupo${otherGroups.length !== 1 ? "s" : ""} existente${otherGroups.length !== 1 ? "s" : ""} y arrastra para mover.`}
                  disabled={isProcessing}
                  onClick={() => setShowGroupSelector(true)}
                />
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-5 py-3 border-t border-border/60">
          <Button
            variant="ghost"
            size="sm"
            disabled={isProcessing}
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground"
          >
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}
