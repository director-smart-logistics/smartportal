import { useEffect, useRef } from "react";

interface ScreenReaderAnnouncementProps {
  message: string;
  priority?: "polite" | "assertive";
  clearAfter?: number; // milliseconds to clear the message
}

/**
 * Screen Reader Announcement Component
 * Provides live region announcements for dynamic content changes
 *
 * Usage:
 * <ScreenReaderAnnouncement message="10 search results found" priority="polite" />
 * <ScreenReaderAnnouncement message="Error: Form validation failed" priority="assertive" />
 */
export function ScreenReaderAnnouncement({
  message,
  priority = "polite",
  clearAfter,
}: ScreenReaderAnnouncementProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (clearAfter && message) {
      const timer = setTimeout(() => {
        if (ref.current) {
          ref.current.textContent = "";
        }
      }, clearAfter);

      return () => clearTimeout(timer);
    }
  }, [message, clearAfter]);

  if (!message) return null;

  return (
    <div
      ref={ref}
      role={priority === "assertive" ? "alert" : "status"}
      aria-live={priority}
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </div>
  );
}

/**
 * Hook for programmatic announcements
 *
 * Usage:
 * const announce = useScreenReaderAnnouncement();
 * announce('Data loaded successfully');
 */
export function useScreenReaderAnnouncement() {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Create announcement container if it doesn't exist
    if (!ref.current) {
      const container = document.createElement("div");
      container.setAttribute("role", "status");
      container.setAttribute("aria-live", "polite");
      container.setAttribute("aria-atomic", "true");
      container.className = "sr-only";
      document.body.appendChild(container);
      ref.current = container;
    }

    return () => {
      if (ref.current && document.body.contains(ref.current)) {
        document.body.removeChild(ref.current);
      }
    };
  }, []);

  return (message: string, clearAfter = 3000) => {
    if (ref.current) {
      ref.current.textContent = message;

      if (clearAfter) {
        setTimeout(() => {
          if (ref.current) {
            ref.current.textContent = "";
          }
        }, clearAfter);
      }
    }
  };
}
