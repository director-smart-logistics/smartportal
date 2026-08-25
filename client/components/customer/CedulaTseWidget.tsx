import React, { useState, useCallback } from 'react';
import {
    Search,
    Loader2,
    CheckCircle,
    AlertTriangle,
    UserCheck,
    RefreshCw,
    ChevronDown,
    ChevronUp,
    ArrowRight,
} from 'lucide-react';
import { cn } from "@/lib/utils";
import { sp2Api } from "@/lib/firebase/callable";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TsePersona {
  cedula: string;
  nombreCompleto?: string;
  fechaNacimiento?: string;
  nacionalidad?: string;
  edad?: string;
  padre?: string;
  madre?: string;
  rawFields?: Record<string, string>;
}

export interface ApplyData {
    firstName: string;
    lastName: string;
    verifiedDni: string;
    /** Date of birth as returned by TSE (e.g. "27/09/1987"). Undefined if TSE did not return it. */
    birthDate?: string;
    /** Nationality as returned by TSE (e.g. "Costarricense"). Undefined if TSE did not return it. */
    nationality?: string;
}

export interface CedulaTseWidgetProps {
    /** Current raw DNI value from the form */
    cedula: string;
    /** Current first name stored in the profile (for comparison) */
    currentFirstName?: string;
    /** Current last name stored in the profile (for comparison) */
    currentLastName?: string;
    /** Called when admin clicks "Corregir" / "Aplicar" */
    onApply: (data: ApplyData) => void;
    /** Whether this cedula was already TSE-verified */
    isVerified?: boolean;
}

type WidgetState = 'idle' | 'loading' | 'result' | 'error';

interface NameComparison {
    tseFirstName: string;
    tseLastName: string;
    tseFullName: string;
    firstNameMatch: boolean;
    lastNameMatch: boolean;
    fullMatch: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Normalise for comparison: uppercase, remove accents, collapse whitespace */
function normalise(str: string): string {
    return str
        .trim()
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ');
}

/**
 * TSE Costa Rica returns the full name as:
 *   "PRIMER_NOMBRE [SEGUNDO_NOMBRE] PRIMER_APELLIDO SEGUNDO_APELLIDO"
 * We split the last two tokens as lastNames and the rest as firstNames.
 */
function splitFullName(fullName: string): { firstName: string; lastName: string } {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return { firstName: parts[0], lastName: '' };
    if (parts.length === 2) return { firstName: parts[0], lastName: parts[1] };
    const lastNames = parts.slice(-2).join(' ');
    const firstNames = parts.slice(0, -2).join(' ');
    return { firstName: firstNames, lastName: lastNames };
}

function toTitleCase(str: string): string {
    return str
        .toLowerCase()
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

function compareNames(
    persona: TsePersona,
    currentFirstName: string,
    currentLastName: string,
): NameComparison {
    const tseFullRaw = persona.nombreCompleto ?? '';
    const { firstName: tseFirst, lastName: tseLast } = splitFullName(tseFullRaw);

    const tseFirstName = toTitleCase(tseFirst);
    const tseLastName = toTitleCase(tseLast);

    // Also check against the combined full name
    const storedFull = normalise(`${currentFirstName} ${currentLastName}`);
    const tseFull = normalise(tseFullRaw);

    const firstNameMatch = normalise(currentFirstName) === normalise(tseFirst);
    const lastNameMatch = normalise(currentLastName) === normalise(tseLast);
    const fullMatch = storedFull === tseFull || (firstNameMatch && lastNameMatch);

    return {
        tseFirstName,
        tseLastName,
        tseFullName: toTitleCase(tseFullRaw),
        firstNameMatch,
        lastNameMatch,
        fullMatch,
    };
}

// ─── Component ───────────────────────────────────────────────────────────────

export const CedulaTseWidget: React.FC<CedulaTseWidgetProps> = ({
    cedula,
    currentFirstName = '',
    currentLastName = '',
    onApply,
    isVerified = false,
}) => {
    const [state, setState] = useState<WidgetState>('idle');
    const [persona, setPersona] = useState<TsePersona | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState(true);

    const cleanCedula = cedula.trim().replace(/\D/g, '');
    const canQuery = cleanCedula.length === 9;

    const handleQuery = useCallback(async () => {
        if (!canQuery) return;
        setState('loading');
        setError(null);
        setPersona(null);
        setExpanded(true);
        try {
            const result = await sp2Api.tse.consultarCedula(cleanCedula);
            setPersona(result);
            setState('result');
        } catch (err: any) {
            setError(err?.message || 'Error al consultar el TSE.');
            setState('error');
        }
    }, [canQuery, cleanCedula]);

    const handleApply = useCallback(() => {
        if (!persona?.nombreCompleto) return;
        const { firstName, lastName } = splitFullName(persona.nombreCompleto);
        onApply({
            firstName: toTitleCase(firstName),
            lastName: toTitleCase(lastName),
            verifiedDni: cleanCedula,
            birthDate: persona.fechaNacimiento || undefined,
            nationality: persona.nacionalidad ? toTitleCase(persona.nacionalidad) : undefined,
        });
    }, [persona, cleanCedula, onApply]);

    // ── Idle ─────────────────────────────────────────────────────────────────
    if (state === 'idle') {
        return (
            <button
                type="button"
                onClick={handleQuery}
                disabled={!canQuery}
                aria-label="Verificar nombre con el Registro Civil (TSE)"
                className={cn(
                    'mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium border transition-colors',
                    canQuery
                        ? 'border-blue-600/40 text-blue-600 bg-blue-50/50 hover:bg-blue-50 dark:border-blue-500/40 dark:text-blue-400 dark:bg-blue-950/20 dark:hover:bg-blue-950/40'
                        : 'border-gray-200 text-gray-400 bg-gray-50 cursor-not-allowed dark:border-gray-800 dark:text-gray-600 dark:bg-gray-950/20',
                )}
            >
                <Search className="w-3 h-3" />
                Verificar con TSE
                {isVerified && (
                    <span className="ml-0.5 inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle className="w-2.5 h-2.5" />
                        Verificado
                    </span>
                )}
            </button>
        );
    }

    // ── Loading ───────────────────────────────────────────────────────────────
    if (state === 'loading') {
        return (
            <div className="mt-1.5 flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                <Loader2 className="w-3 h-3 animate-spin text-blue-600 dark:text-blue-400" />
                Consultando Registro Civil…
            </div>
        );
    }

    // ── Error ─────────────────────────────────────────────────────────────────
    if (state === 'error') {
        return (
            <div className="mt-1.5 flex items-start gap-2 text-[11px] text-red-600 dark:text-red-400">
                <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                <span className="flex-1">{error}</span>
                <button
                    type="button"
                    onClick={handleQuery}
                    className="shrink-0 flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
                >
                    <RefreshCw className="w-2.5 h-2.5" />
                    Reintentar
                </button>
            </div>
        );
    }

    // ── Result ────────────────────────────────────────────────────────────────
    if (state === 'result' && persona) {
        const cmp = compareNames(persona, currentFirstName, currentLastName);
        const hasCurrentName = currentFirstName.trim() || currentLastName.trim();

        const borderCls = cmp.fullMatch
            ? 'border-emerald-200 dark:border-emerald-800/60'
            : 'border-amber-300 dark:border-amber-700/60';
        const bgCls = cmp.fullMatch 
            ? 'bg-emerald-50/55 dark:bg-emerald-950/10' 
            : 'bg-amber-50/55 dark:bg-amber-950/10';
        const headerBorderCls = cmp.fullMatch
            ? 'border-emerald-100 dark:border-emerald-900/40'
            : 'border-amber-200 dark:border-amber-800/40';
        const iconColor = cmp.fullMatch ? 'text-emerald-600 dark:text-emerald-450' : 'text-amber-600 dark:text-amber-450';
        const labelColor = cmp.fullMatch ? 'text-emerald-850 dark:text-emerald-300' : 'text-amber-850 dark:text-amber-300';
        const refreshColor = cmp.fullMatch
            ? 'text-emerald-400 hover:text-emerald-700 dark:text-emerald-600 dark:hover:text-emerald-400'
            : 'text-amber-400 hover:text-amber-700 dark:text-amber-600 dark:hover:text-amber-400';
        const chevronColor = refreshColor;

        return (
            <div className={cn('mt-2 rounded-lg border overflow-hidden', borderCls, bgCls)}>
                {/* ── Header ── */}
                <div className={cn(
                    'flex items-center justify-between px-3 py-2 border-b',
                    headerBorderCls,
                )}>
                    <div className="flex items-center gap-1.5">
                        {cmp.fullMatch
                            ? <CheckCircle className={cn('w-3.5 h-3.5 shrink-0', iconColor)} />
                            : <AlertTriangle className={cn('w-3.5 h-3.5 shrink-0', iconColor)} />}
                        <span className={cn('text-[11px] font-bold', labelColor)}>
                            {cmp.fullMatch
                                ? 'Nombre coincide con el Registro Civil'
                                : 'Nombre no coincide — requiere ajuste'}
                        </span>
                        <span className={cn(
                            'font-mono text-[10px] px-1.5 py-0.5 rounded',
                            cmp.fullMatch
                                ? 'text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-900/30'
                                : 'text-amber-800 bg-amber-105 dark:text-amber-300 dark:bg-amber-900/30',
                        )}>
                            {sp2Api.tse.formatCedula(cleanCedula)}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleQuery}
                            aria-label="Volver a consultar"
                            className={cn('transition-colors', refreshColor)}
                        >
                            <RefreshCw className="w-3 h-3" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setExpanded(v => !v)}
                            aria-label={expanded ? 'Colapsar' : 'Expandir'}
                            className={cn('transition-colors', chevronColor)}
                        >
                            {expanded
                                ? <ChevronUp className="w-3 h-3" />
                                : <ChevronDown className="w-3 h-3" />}
                        </button>
                    </div>
                </div>

                {expanded && (
                    <>
                        {/* ── Comparison rows ── */}
                        {hasCurrentName && !cmp.fullMatch && (
                            <div className="px-3 py-2.5 space-y-2">
                                <CompareRow
                                    label="Nombre(s)"
                                    current={currentFirstName}
                                    tse={cmp.tseFirstName}
                                    match={cmp.firstNameMatch}
                                />
                                <CompareRow
                                    label="Apellido(s)"
                                    current={currentLastName}
                                    tse={cmp.tseLastName}
                                    match={cmp.lastNameMatch}
                                />
                            </div>
                        )}

                        {/* ── Match: just show TSE data compactly ── */}
                        {cmp.fullMatch && (
                            <div className="px-3 py-2 space-y-1">
                                <InfoRow label="Nombre" value={cmp.tseFirstName} />
                                <InfoRow label="Apellidos" value={cmp.tseLastName} />
                                {persona.fechaNacimiento && (
                                    <InfoRow label="Nacimiento" value={persona.fechaNacimiento} />
                                )}
                                {persona.nacionalidad && (
                                    <InfoRow label="Nacionalidad" value={toTitleCase(persona.nacionalidad)} />
                                )}
                            </div>
                        )}

                        {/* ── Action footer ── */}
                        {persona.nombreCompleto && (
                            <div className={cn(
                                'px-3 py-2 border-t flex items-center justify-between gap-2',
                                cmp.fullMatch
                                    ? 'bg-emerald-100/30 border-emerald-100/40 dark:bg-emerald-950/20 dark:border-emerald-900/30'
                                    : 'bg-amber-100/30 border-amber-200/40 dark:bg-amber-950/20 dark:border-amber-900/30',
                            )}>
                                {cmp.fullMatch ? (
                                    <p className="text-[10px] text-emerald-700 dark:text-emerald-450 leading-snug">
                                        El nombre del perfil coincide con el Registro Civil.
                                    </p>
                                ) : (
                                    <p className="text-[10px] text-amber-800 dark:text-amber-450 leading-snug">
                                        Correcto según TSE:{' '}
                                        <strong>{cmp.tseFirstName} {cmp.tseLastName}</strong>
                                    </p>
                                )}
                                {!cmp.fullMatch && (
                                    <button
                                        type="button"
                                        onClick={handleApply}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold bg-amber-600 hover:bg-amber-700 text-white transition-colors shrink-0"
                                    >
                                        <UserCheck className="w-3 h-3" />
                                        Corregir
                                    </button>
                                )}
                                {cmp.fullMatch && (
                                    <button
                                        type="button"
                                        onClick={handleApply}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shrink-0"
                                    >
                                        <UserCheck className="w-3 h-3" />
                                        Aplicar
                                    </button>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>
        );
    }

    return null;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const CompareRow: React.FC<{
    label: string;
    current: string;
    tse: string;
    match: boolean;
}> = ({ label, current, tse, match }) => (
    <div className="space-y-0.5">
        <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-500 uppercase tracking-wider">
            {label}
        </p>
        <div className="flex items-center gap-1.5 flex-wrap">
            <span className={cn(
                'text-[11px] font-medium px-1.5 py-0.5 rounded',
                match
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400'
                    : 'bg-red-100 text-red-700 line-through dark:bg-red-950/30 dark:text-red-400',
            )}>
                {current || <em className="opacity-50">vacío</em>}
            </span>
            {!match && (
                <>
                    <ArrowRight className="w-3 h-3 text-amber-500 shrink-0" />
                    <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 dark:bg-amber-900/50 dark:text-amber-205">
                        {tse}
                    </span>
                </>
            )}
        </div>
    </div>
);

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <div className="flex items-baseline gap-2">
        <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-500 uppercase tracking-wider w-20 shrink-0">
            {label}
        </span>
        <span className="text-[11px] text-gray-800 dark:text-gray-200 font-medium">{value}</span>
    </div>
);
