import React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PermissionTooltipProps {
  /** If true, the user has permission and the children will render normally */
  allowed: boolean;
  /** The message to show when the user does not have permission */
  message?: string;
  /** The children to render. Must accept disabled prop if they are buttons. */
  children: React.ReactNode;
  /** Optional className for the wrapper span when disabled */
  wrapperClassName?: string;
  /** Optional side for the tooltip placement */
  side?: "top" | "right" | "bottom" | "left";
  /** Optional align for the tooltip placement */
  align?: "start" | "center" | "end";
}

/**
 * A wrapper component that disables its children and shows a tooltip if the user
 * does not have permission.
 *
 * Note: When `allowed` is false, it clones the child to inject `disabled: true`
 * and `className: "opacity-50 cursor-not-allowed"`, and wraps it in a span so
 * the tooltip can trigger (disabled buttons do not fire mouse events).
 */
export function PermissionTooltip({
  allowed,
  message = "No tienes permisos para realizar esta acción.",
  children,
  wrapperClassName = "inline-block",
  side = "top",
  align,
}: PermissionTooltipProps) {
  if (allowed) {
    return <>{children}</>;
  }

  // Clone the child to enforce disabled state visually
  const disabledChild = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<any>, {
        disabled: true,
        className:
          `${children.props.className || ""} opacity-50 cursor-not-allowed pointer-events-none`.trim(),
        // remove onClick to be absolutely safe
        onClick: undefined,
      })
    : children;

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        {/* We need a wrapper span because disabled elements don't trigger hover events */}
        <TooltipTrigger asChild>
          <span className={wrapperClassName} style={{ cursor: "not-allowed" }}>
            {disabledChild}
          </span>
        </TooltipTrigger>
        <TooltipContent
          side={side}
          align={align}
          className="z-50 bg-gray-900 text-white font-medium"
        >
          <p>{message}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
