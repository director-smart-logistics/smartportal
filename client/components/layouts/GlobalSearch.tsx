import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useLocale } from "@/hooks/useLocale";
import { useAuth } from "@/hooks/useAuth";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Search, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { getNavigationItems, NavItem } from "@/config/navigation";

export function GlobalSearch() {
  const { t } = useLocale(["search", "common", "menu", "dashboard", "users"]);
  const navigate = useNavigate();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Get all navigation items with translations
  const allNavigationItems = useMemo(() => getNavigationItems(t), [t]);

  // Filter navigation items based on user role
  const availableItems = useMemo(() => {
    if (!user) return [];

    return allNavigationItems.filter((item) => {
      // Check role-based access
      return item.roles.includes(user.role);
    });
  }, [allNavigationItems, user]);

  // Filter items based on search query
  const filteredItems = useMemo(() => {
    if (!search) return availableItems;

    const searchLower = search.toLowerCase();
    return availableItems.filter((item) => {
      return (
        item.label.toLowerCase().includes(searchLower) ||
        item.href.toLowerCase().includes(searchLower) ||
        (item.keywords &&
          item.keywords.some((keyword) =>
            keyword.toLowerCase().includes(searchLower),
          ))
      );
    });
  }, [search, availableItems]);

  // Group filtered items by section
  const groupedItems = useMemo(() => {
    const groups: Record<string, NavItem[]> = {};
    filteredItems.forEach((item) => {
      if (!groups[item.section]) {
        groups[item.section] = [];
      }
      groups[item.section].push(item);
    });
    return groups;
  }, [filteredItems]);

  // Handle keyboard shortcut (Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Handle selection
  const handleSelect = useCallback(
    (href: string) => {
      setOpen(false);
      setSearch("");
      navigate(href);
    },
    [navigate],
  );

  // Handle dialog close
  const handleOpenChange = useCallback((newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setSearch("");
    }
  }, []);

  return (
    <>
      {/* Command palette trigger — compact badge style */}
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md",
          "border border-border bg-background",
          "text-muted-foreground hover:text-foreground hover:bg-accent",
          "transition-colors duration-150",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
        )}
        data-testid="global-search-trigger"
        aria-label={t("title")}
      >
        <Search className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <kbd className="pointer-events-none inline-flex select-none items-center gap-0.5 font-mono text-[11px] font-medium">
          <span>⌘</span>
          <span>K</span>
        </kbd>
      </button>

      {/* Command Palette Dialog */}
      <CommandDialog
        open={open}
        onOpenChange={handleOpenChange}
        data-testid="global-search-dialog"
      >
        <CommandInput
          placeholder={t("placeholder")}
          value={search}
          onValueChange={setSearch}
          data-testid="global-search-input"
          className="border-none focus:ring-0"
        />
        <CommandList data-testid="global-search-results">
          <CommandEmpty data-testid="global-search-no-results">
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <Search className="h-8 w-8 text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">{t("noResults")}</p>
              {search && (
                <p className="text-xs text-muted-foreground mt-1">
                  Try searching for: packages, tracking, employees, etc.
                </p>
              )}
            </div>
          </CommandEmpty>

          {Object.entries(groupedItems).map(([section, items]) => (
            <CommandGroup
              key={section}
              heading={t(`menu.${section}`)}
              data-testid={`global-search-section-${section}`}
            >
              {items.map((item) => (
                <CommandItem
                  key={item.href}
                  value={item.href}
                  onSelect={() => handleSelect(item.href)}
                  keywords={item.keywords}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 cursor-pointer",
                    "data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground",
                    "transition-colors duration-150",
                  )}
                  data-testid={`global-search-item-${item.href.replace(/\//g, "-")}`}
                >
                  <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/10 text-primary">
                    {item.icon}
                  </div>
                  <div className="flex-1 flex flex-col gap-0.5">
                    <span className="font-medium text-sm">{item.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {item.href}
                    </span>
                  </div>
                  <ArrowRight
                    className="h-4 w-4 text-muted-foreground/50"
                    aria-hidden="true"
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          ))}

          <CommandSeparator />

          <div className="px-4 py-2 text-xs text-muted-foreground">
            <p className="flex items-center gap-2">
              <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100">
                Esc
              </kbd>
              {t("pressToClose")}
            </p>
          </div>
        </CommandList>
      </CommandDialog>
    </>
  );
}
