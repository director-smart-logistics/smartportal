/**
 * CopyButton
 *
 * Inline icon button that copies text to clipboard.
 * Shows a brief checkmark animation on success.
 */

import React, { useState, useCallback } from 'react';
import { Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface CopyButtonProps {
  /** The text to copy to clipboard */
  value: string;
  /** Optional tooltip label (defaults to "Copiar") */
  label?: string;
  /** Additional class names */
  className?: string;
  /** Icon size class (defaults to "h-3 w-3") */
  iconSize?: string;
}

export function CopyButton({ value, label = 'Copiar', className, iconSize = 'h-3 w-3' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [value]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            'inline-flex items-center justify-center shrink-0 rounded p-0.5',
            'text-muted-foreground/40 hover:text-foreground hover:bg-muted/60',
            'transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            copied && 'text-emerald-500 hover:text-emerald-500',
            className,
          )}
          aria-label={label}
        >
          {copied
            ? <Check className={cn(iconSize, 'transition-transform scale-110')} aria-hidden />
            : <Copy className={iconSize} aria-hidden />
          }
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-[10px] px-1.5 py-0.5">
        {copied ? 'Copiado' : label}
      </TooltipContent>
    </Tooltip>
  );
}
