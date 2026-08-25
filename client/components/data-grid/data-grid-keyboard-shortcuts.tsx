import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DataGridKeyboardShortcutsProps {
  enableSearch?: boolean;
}

export function DataGridKeyboardShortcuts({
  enableSearch = true,
}: DataGridKeyboardShortcutsProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault();
        setOpen(!open);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <h3 className="font-semibold text-sm">Navigation</h3>
            <ul className="text-sm space-y-1 text-muted-foreground">
              <li>
                <kbd className="px-2 py-1 bg-muted rounded">↑</kbd> /{" "}
                <kbd className="px-2 py-1 bg-muted rounded">↓</kbd> - Move
                up/down
              </li>
              <li>
                <kbd className="px-2 py-1 bg-muted rounded">←</kbd> /{" "}
                <kbd className="px-2 py-1 bg-muted rounded">→</kbd> - Move
                left/right
              </li>
            </ul>
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold text-sm">Editing</h3>
            <ul className="text-sm space-y-1 text-muted-foreground">
              <li>
                <kbd className="px-2 py-1 bg-muted rounded">F2</kbd> /{" "}
                <kbd className="px-2 py-1 bg-muted rounded">Enter</kbd> - Start
                editing
              </li>
              <li>
                <kbd className="px-2 py-1 bg-muted rounded">Esc</kbd> - Cancel
                editing
              </li>
              <li>
                <kbd className="px-2 py-1 bg-muted rounded">Tab</kbd> - Move to
                next cell
              </li>
            </ul>
          </div>

          {enableSearch && (
            <div className="space-y-2">
              <h3 className="font-semibold text-sm">Search</h3>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>
                  <kbd className="px-2 py-1 bg-muted rounded">Ctrl</kbd> +{" "}
                  <kbd className="px-2 py-1 bg-muted rounded">F</kbd> - Open
                  search
                </li>
                <li>
                  <kbd className="px-2 py-1 bg-muted rounded">Enter</kbd> - Next
                  match
                </li>
              </ul>
            </div>
          )}

          <div className="space-y-2">
            <h3 className="font-semibold text-sm">Clipboard</h3>
            <ul className="text-sm space-y-1 text-muted-foreground">
              <li>
                <kbd className="px-2 py-1 bg-muted rounded">Ctrl</kbd> +{" "}
                <kbd className="px-2 py-1 bg-muted rounded">C</kbd> - Copy
              </li>
              <li>
                <kbd className="px-2 py-1 bg-muted rounded">Ctrl</kbd> +{" "}
                <kbd className="px-2 py-1 bg-muted rounded">X</kbd> - Cut
              </li>
              <li>
                <kbd className="px-2 py-1 bg-muted rounded">Ctrl</kbd> +{" "}
                <kbd className="px-2 py-1 bg-muted rounded">V</kbd> - Paste
              </li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
