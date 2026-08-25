import { useState, useEffect, useCallback } from "react";
import { useLocale } from "@/hooks/useLocale";
import { useTheme } from "@/lib/context/ThemeContext";
import { firestoreApi } from "@/lib/firebase/firestore-client";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Edit2, Save, X, Plus, Trash2, RefreshCw, Download, Filter } from "lucide-react";
import {
  seedDefaultConsolidationRules,
  invalidateConsolidationCache,
  type RuleCategory,
  type RuleType,
} from "@/lib/services/consolidation-rules-service";
import { cn } from "@/lib/utils";

interface ConsolidationRule {
  id: string;
  ruleKey: string;
  ruleName: string;
  description?: string;
  category: RuleCategory;
  ruleType: RuleType;
  valueBoolean?: boolean;
  valueNumber?: number;
  valueText?: string;
  valueList?: string[];
  unit?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const CATEGORIES: { value: RuleCategory; label: string; color: string }[] = [
  { value: "limit",       label: "Límite",       color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  { value: "exclusion",   label: "Exclusión",    color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
  { value: "timing",      label: "Plazos",       color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  { value: "billing",     label: "Cobro",        color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300" },
  { value: "operational", label: "Operacional",  color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" },
];

function CategoryBadge({ category }: { category: RuleCategory }) {
  const meta = CATEGORIES.find(c => c.value === category) ?? CATEGORIES[4];
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", meta.color)}>
      {meta.label}
    </span>
  );
}

export default function ConsolidationRulesTab() {
  const { t } = useLocale(["settings", "common"]);
  const { theme } = useTheme();
  const { toast } = useToast();
  const isDark = theme === "dark";

  const [rules, setRules] = useState<ConsolidationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<RuleCategory | "all">("all");
  const [editingRule, setEditingRule] = useState<ConsolidationRule | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [listInput, setListInput] = useState("");

  const fetchRules = useCallback(async () => {
    try {
      setLoading(true);
      const data = await firestoreApi.consolidationRules.list();
      if (data) {
        setRules(data as ConsolidationRule[]);
      }
    } catch (error: any) {
      toast({
        title: t("common.error"),
        description: error.message || "Error cargando reglas de consolidación",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const handleSeedDefaults = async () => {
    if (!confirm("¿Importar las reglas por defecto de la política de consolidación? Solo se crearán las que aún no existen.")) return;
    try {
      setSeeding(true);
      const result = await seedDefaultConsolidationRules();
      invalidateConsolidationCache();
      toast({
        title: "Reglas importadas",
        description: `${result.created} creadas · ${result.skipped} ya existían`,
      });
      fetchRules();
    } catch (error: any) {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    } finally {
      setSeeding(false);
    }
  };

  const handleToggleActive = async (rule: ConsolidationRule) => {
    try {
      await firestoreApi.consolidationRules.toggleActive(rule.id);
      invalidateConsolidationCache();
      toast({
        title: t("common.success"),
        description: rule.isActive ? "Regla desactivada" : "Regla activada",
      });
      fetchRules();
    } catch (error: any) {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    }
  };

  const handleEdit = (rule: ConsolidationRule) => {
    setEditingRule({ ...rule });
    setListInput((rule.valueList ?? []).join(", "));
    setIsCreating(false);
    setIsDialogOpen(true);
  };

  const handleCreate = () => {
    const blank: ConsolidationRule = {
      id: "",
      ruleKey: "",
      ruleName: "",
      description: "",
      category: "limit",
      ruleType: "number",
      valueBoolean: false,
      valueNumber: 0,
      valueText: "",
      valueList: [],
      unit: "",
      isActive: true,
      createdAt: "",
      updatedAt: "",
    };
    setEditingRule(blank);
    setListInput("");
    setIsCreating(true);
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editingRule) return;
    if (!editingRule.ruleKey.trim() || !editingRule.ruleName.trim()) {
      toast({ title: "Campos requeridos", description: "ruleKey y ruleName son obligatorios", variant: "destructive" });
      return;
    }

    try {
      const parsedList = listInput
        .split(",")
        .map(s => s.trim().toLowerCase())
        .filter(Boolean);

      const payload: Partial<ConsolidationRule> = {
        ruleKey: editingRule.ruleKey.trim(),
        ruleName: editingRule.ruleName.trim(),
        description: editingRule.description ?? "",
        category: editingRule.category,
        ruleType: editingRule.ruleType,
        unit: editingRule.unit ?? "",
        isActive: editingRule.isActive,
      };

      if (editingRule.ruleType === "boolean") payload.valueBoolean = editingRule.valueBoolean ?? false;
      if (editingRule.ruleType === "number") payload.valueNumber = editingRule.valueNumber ?? 0;
      if (editingRule.ruleType === "text") payload.valueText = editingRule.valueText ?? "";
      if (editingRule.ruleType === "list") payload.valueList = parsedList;

      if (isCreating) {
        await firestoreApi.consolidationRules.create(payload);
        toast({ title: t("common.success"), description: "Regla creada" });
      } else {
        await firestoreApi.consolidationRules.update(editingRule.id, payload);
        toast({ title: t("common.success"), description: "Regla actualizada" });
      }

      invalidateConsolidationCache();
      setIsDialogOpen(false);
      setEditingRule(null);
      fetchRules();
    } catch (error: any) {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar esta regla de consolidación?")) return;
    try {
      await firestoreApi.consolidationRules.delete(id);
      invalidateConsolidationCache();
      toast({ title: t("common.success"), description: "Regla eliminada" });
      fetchRules();
    } catch (error: any) {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    }
  };

  const getRuleValueDisplay = (rule: ConsolidationRule): string => {
    switch (rule.ruleType) {
      case "boolean":  return rule.valueBoolean ? "✓ Sí" : "✗ No";
      case "number":   return `${rule.valueNumber ?? 0}${rule.unit ? ` ${rule.unit}` : ""}`;
      case "text":     return rule.valueText ?? "";
      case "list":     return (rule.valueList ?? []).join(", ") || "—";
      default:         return "—";
    }
  };

  const displayedRules = categoryFilter === "all"
    ? rules
    : rules.filter(r => r.category === categoryFilter);

  const counts = CATEGORIES.reduce<Record<string, number>>((acc, cat) => {
    acc[cat.value] = rules.filter(r => r.category === cat.value).length;
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <RefreshCw className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Reglas de Consolidación</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Configura los límites, exclusiones, plazos y cobros que gobiernan el proceso de consolidación de Nova.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" onClick={fetchRules} title="Actualizar">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSeedDefaults}
            disabled={seeding}
            title="Importar reglas por defecto desde política oficial"
          >
            {seeding ? <RefreshCw className="h-4 w-4 animate-spin mr-1" /> : <Download className="h-4 w-4 mr-1" />}
            Importar política
          </Button>
          <Button size="sm" onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Nueva regla
          </Button>
        </div>
      </div>

      {/* Category filter chips */}
      <div className="flex flex-wrap gap-2 items-center">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <button
          onClick={() => setCategoryFilter("all")}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium border transition-colors",
            categoryFilter === "all"
              ? "bg-foreground text-background border-foreground"
              : "bg-transparent text-muted-foreground border-border hover:border-foreground/40"
          )}
        >
          Todas ({rules.length})
        </button>
        {CATEGORIES.map(cat => (
          <button
            key={cat.value}
            onClick={() => setCategoryFilter(cat.value)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium border transition-colors",
              categoryFilter === cat.value
                ? cn(cat.color, "border-transparent")
                : "bg-transparent text-muted-foreground border-border hover:border-foreground/40"
            )}
          >
            {cat.label} ({counts[cat.value] ?? 0})
          </button>
        ))}
      </div>

      {/* Stats summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {CATEGORIES.map(cat => (
          <Card key={cat.value} className="p-3 text-center">
            <p className="text-2xl font-bold">{counts[cat.value] ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{cat.label}</p>
          </Card>
        ))}
      </div>

      {/* Rules table */}
      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[220px]">Nombre / Descripción</TableHead>
              <TableHead className="min-w-[160px]">Clave</TableHead>
              <TableHead className="min-w-[100px]">Categoría</TableHead>
              <TableHead className="min-w-[130px]">Valor</TableHead>
              <TableHead className="w-[80px]">Estado</TableHead>
              <TableHead className="w-[100px] text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayedRules.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-muted-foreground text-sm">
                  {rules.length === 0
                    ? 'Sin reglas. Usa "Importar política" para cargar las reglas por defecto.'
                    : "Sin reglas en esta categoría."}
                </TableCell>
              </TableRow>
            )}
            {displayedRules.map((rule) => (
              <TableRow key={rule.id} className={!rule.isActive ? "opacity-50" : undefined}>
                <TableCell>
                  <div>
                    <p className="font-semibold text-sm leading-tight">{rule.ruleName}</p>
                    {rule.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{rule.description}</p>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <code className={cn(
                    "text-xs px-2 py-0.5 rounded font-mono",
                    isDark ? "bg-zinc-800" : "bg-zinc-100"
                  )}>
                    {rule.ruleKey}
                  </code>
                </TableCell>
                <TableCell>
                  <CategoryBadge category={rule.category ?? "operational"} />
                </TableCell>
                <TableCell>
                  <span className="font-mono text-sm font-semibold">{getRuleValueDisplay(rule)}</span>
                </TableCell>
                <TableCell>
                  <Switch
                    checked={rule.isActive}
                    onCheckedChange={() => handleToggleActive(rule)}
                    aria-label={rule.isActive ? "Desactivar" : "Activar"}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(rule)} className="h-8 w-8 p-0" aria-label="Editar">
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => handleDelete(rule.id)}
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                      aria-label="Eliminar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" aria-describedby="rule-dialog-description">
          <DialogHeader>
            <DialogTitle>{isCreating ? "Nueva regla de consolidación" : "Editar regla"}</DialogTitle>
            <DialogDescription id="rule-dialog-description">
              {isCreating ? "Define una nueva regla de negocio para el proceso de consolidación." : "Actualiza la configuración de esta regla."}
            </DialogDescription>
          </DialogHeader>

          {editingRule && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ruleKey">Clave (ruleKey) *</Label>
                  <Input
                    id="ruleKey"
                    value={editingRule.ruleKey}
                    onChange={(e) => setEditingRule({ ...editingRule, ruleKey: e.target.value })}
                    placeholder="ej: max_packages"
                    disabled={!isCreating}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">Snake_case único. No se puede cambiar tras crear.</p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="category">Categoría *</Label>
                  <Select
                    value={editingRule.category}
                    onValueChange={(v: RuleCategory) => setEditingRule({ ...editingRule, category: v })}
                  >
                    <SelectTrigger id="category"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ruleName">Nombre *</Label>
                <Input
                  id="ruleName"
                  value={editingRule.ruleName}
                  onChange={(e) => setEditingRule({ ...editingRule, ruleName: e.target.value })}
                  placeholder="Nombre descriptivo de la regla"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description">Descripción</Label>
                <Textarea
                  id="description"
                  value={editingRule.description ?? ""}
                  onChange={(e) => setEditingRule({ ...editingRule, description: e.target.value })}
                  placeholder="¿Qué hace esta regla?"
                  rows={2}
                  className="text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ruleType">Tipo de valor *</Label>
                  <Select
                    value={editingRule.ruleType}
                    onValueChange={(v: RuleType) => setEditingRule({ ...editingRule, ruleType: v })}
                    disabled={!isCreating}
                  >
                    <SelectTrigger id="ruleType"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="boolean">Booleano (Sí/No)</SelectItem>
                      <SelectItem value="number">Número</SelectItem>
                      <SelectItem value="text">Texto</SelectItem>
                      <SelectItem value="list">Lista (CSV)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="unit">Unidad</Label>
                  <Input
                    id="unit"
                    value={editingRule.unit ?? ""}
                    onChange={(e) => setEditingRule({ ...editingRule, unit: e.target.value })}
                    placeholder="kg, días, USD, paquetes…"
                    className="text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="value">Valor</Label>
                {editingRule.ruleType === "boolean" && (
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={editingRule.valueBoolean ?? false}
                      onCheckedChange={(v) => setEditingRule({ ...editingRule, valueBoolean: v })}
                    />
                    <span className="text-sm">{editingRule.valueBoolean ? "Habilitado (true)" : "Deshabilitado (false)"}</span>
                  </div>
                )}
                {editingRule.ruleType === "number" && (
                  <Input
                    id="value"
                    type="number"
                    step="0.01"
                    value={editingRule.valueNumber ?? 0}
                    onChange={(e) => setEditingRule({ ...editingRule, valueNumber: parseFloat(e.target.value) || 0 })}
                    className="font-mono"
                  />
                )}
                {editingRule.ruleType === "text" && (
                  <Input
                    id="value"
                    value={editingRule.valueText ?? ""}
                    onChange={(e) => setEditingRule({ ...editingRule, valueText: e.target.value })}
                  />
                )}
                {editingRule.ruleType === "list" && (
                  <div className="space-y-1">
                    <Input
                      id="value"
                      value={listInput}
                      onChange={(e) => setListInput(e.target.value)}
                      placeholder="ej: permisos_especiales, electronicos, maritimo"
                      className="text-sm font-mono"
                    />
                    <p className="text-xs text-muted-foreground">Separar valores con comas. Se normalizan a minúsculas.</p>
                    {listInput && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {listInput.split(",").map(s => s.trim()).filter(Boolean).map(v => (
                          <Badge key={v} variant="secondary" className="text-xs">{v}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 pt-1 border-t">
                <Switch
                  checked={editingRule.isActive}
                  onCheckedChange={(v) => setEditingRule({ ...editingRule, isActive: v })}
                />
                <Label>Regla activa</Label>
                {!editingRule.isActive && (
                  <Badge variant="secondary" className="text-xs ml-auto">Inactiva — Nova la ignorará</Badge>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              <X className="h-4 w-4 mr-1" /> Cancelar
            </Button>
            <Button onClick={handleSave}>
              <Save className="h-4 w-4 mr-1" /> Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
