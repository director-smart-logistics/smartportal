import { useState, useRef, useEffect, CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  searchManifests,
  type ManifestSearchResult,
} from "@/lib/firebase/firestore-client";
import { cn } from "@/lib/utils";

interface ManifestAutocompleteProps {
  value: string;
  onChange: (id: string, number: string) => void;
  isDark?: boolean;
  placeholder?: string;
  className?: string;
}

export function ManifestAutocomplete({
  value,
  onChange,
  isDark = false,
  placeholder = "Manifiesto…",
  className,
}: ManifestAutocompleteProps) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<ManifestSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      const r = await searchManifests(query, 12).catch(() => []);
      setResults(r);
      setLoading(false);
      setOpen(r.length > 0);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const updatePos = () => {
      const rect = triggerRef.current!.getBoundingClientRect();
      setDropdownStyle({
        position: "fixed",
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 220),
        zIndex: 9999,
      });
    };
    updatePos();
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    return () => {
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [open]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        !containerRef.current?.contains(t) &&
        !dropdownRef.current?.contains(t)
      )
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Input
          ref={triggerRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (results.length) setOpen(true);
          }}
          placeholder={placeholder}
          className={cn(
            "pr-6",
            isDark ? "bg-gray-700 border-gray-600 text-white" : "",
          )}
        />
        {loading && (
          <Loader2 className="h-3.5 w-3.5 animate-spin absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
        )}
      </div>
      {open &&
        results.length > 0 &&
        createPortal(
          <div
            ref={dropdownRef}
            style={dropdownStyle}
            className={cn(
              "rounded-md border shadow-lg overflow-auto max-h-52 text-sm",
              isDark
                ? "bg-gray-800 border-gray-600"
                : "bg-white border-gray-200",
            )}
          >
            {results.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  const num = r.manifestNumber ?? r.id;
                  setQuery(num);
                  setOpen(false);
                  onChange(r.id, num);
                }}
                className={cn(
                  "w-full text-left px-3 py-2 hover:bg-primary/10 flex items-center justify-between gap-2",
                  isDark ? "text-gray-200" : "text-gray-800",
                )}
              >
                <span className="font-mono text-xs">
                  {r.manifestNumber ?? r.id}
                </span>
                {r.status && (
                  <span className="text-xs text-muted-foreground shrink-0">
                    {String(r.status)}
                  </span>
                )}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
