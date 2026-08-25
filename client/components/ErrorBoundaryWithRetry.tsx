import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { db, auth } from "@/lib/firebase/config";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

async function logErrorToFirestore(error: Error, errorInfo: ErrorInfo) {
  try {
    if (process.env.NODE_ENV !== "production") {
      return;
    }
    const currentUser = auth.currentUser;
    await addDoc(collection(db, "client_errors"), {
      message: error?.message || "Unknown error",
      stack: error?.stack || null,
      componentStack: errorInfo?.componentStack || null,
      url: typeof window !== "undefined" ? window.location.href : "unknown",
      userAgent: typeof window !== "undefined" ? window.navigator.userAgent : "unknown",
      userId: currentUser?.uid || "anonymous",
      userEmail: currentUser?.email || "anonymous",
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    console.warn("Failed to log client error to Firestore:", err);
  }
}

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorCount: number;
}

export class ErrorBoundaryWithRetry extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to console in development
    if (process.env.NODE_ENV === "development") {
      console.error("Error caught by boundary:", error, errorInfo);
    }

    this.setState((prevState) => ({
      error,
      errorInfo,
      errorCount: prevState.errorCount + 1,
    }));

    // Log client error to Firestore in production
    logErrorToFirestore(error, errorInfo);
  }

  handleReset = () => {
    const { onReset } = this.props;

    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });

    // Call custom reset handler if provided
    if (onReset) {
      onReset();
    }
  };

  handleReload = async () => {
    // 1. Clear Cache API (service worker caches, Firebase Hosting precache, etc.)
    //    This is the main fix for stale-asset errors after a new deploy.
    if ('caches' in window) {
      try {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((name) => caches.delete(name)));
      } catch (_) { /* ignore — non-fatal */ }
    }

    // 2. Hard redirect with cache-buster — forces browser to re-fetch all assets
    //    Session/auth cookies are preserved (we do NOT touch localStorage/sessionStorage).
    const url = new URL(window.location.href);
    url.searchParams.set('_r', Date.now().toString());
    window.location.replace(url.toString());
  };

  render() {
    const { hasError, error, errorCount } = this.state;
    const { children, fallback } = this.props;

    if (hasError) {
      // Use custom fallback if provided
      if (fallback) {
        return fallback;
      }

      // Default error UI with retry
      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-background">
          <Card className="max-w-lg w-full p-8">
            <div className="flex flex-col items-center text-center space-y-5">

              {/* Icon */}
              <div className="rounded-full bg-destructive/10 p-5">
                <AlertTriangle className="h-10 w-10 text-destructive" />
              </div>

              {/* Bilingual message */}
              <div className="space-y-1.5">
                <h1 className="text-xl font-bold text-foreground">
                  Algo salió mal&nbsp;<span className="text-muted-foreground font-normal text-base">/ Something went wrong</span>
                </h1>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Esto suele ocurrir después de una actualización del sistema.<br />
                  <span className="text-muted-foreground/70">This usually happens after a new deploy.</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  Tu sesión y datos están seguros.&nbsp;
                  <span className="text-muted-foreground/70">Your session and data are safe.</span>
                </p>
              </div>

              {/* Error Details (development only) */}
              {process.env.NODE_ENV === "development" && error && (
                <Card className="w-full p-3 bg-muted/50 text-left">
                  <p className="text-xs font-mono text-destructive break-all">
                    {error.toString()}
                  </p>
                </Card>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 flex-wrap justify-center pt-1">
                <Button
                  onClick={this.handleReload}
                  className="gap-2"
                  data-testid="error-retry-button"
                >
                  <RefreshCw className="h-4 w-4" />
                  Actualizar Página&nbsp;<span className="opacity-60 text-xs">/ Refresh</span>
                </Button>

                <Button
                  onClick={() => window.history.back()}
                  variant="ghost"
                  data-testid="error-back-button"
                >
                  Volver&nbsp;<span className="opacity-60 text-xs">/ Go Back</span>
                </Button>
              </div>

              {/* Help */}
              <p className="text-xs text-muted-foreground/60">
                Si el problema persiste contacta a soporte.&nbsp;/&nbsp;If the problem persists, contact support.
              </p>
            </div>
          </Card>
        </div>
      );
    }

    return children;
  }
}

// Higher-order component for easy wrapping
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<Props, "children">,
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundaryWithRetry {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundaryWithRetry>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;

  return WrappedComponent;
}
