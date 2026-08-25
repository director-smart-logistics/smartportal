import React, { ReactNode, Component } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { db, auth } from "@/lib/firebase/config";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

async function logErrorToFirestore(error: Error, errorInfo: React.ErrorInfo) {
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
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("Error boundary caught:", errorMsg);
    console.error("Error info:", errorInfo.componentStack);
    logErrorToFirestore(error, errorInfo);
  }

  handleReset = () => {
    try {
      // Reset state to show app again
      this.setState({ hasError: false, error: null });
    } catch (err) {
      console.error("Failed to reset error boundary:", err);
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
            <Card className="p-8 max-w-md w-full dark:bg-gray-800 dark:border-gray-700">
              <div className="flex flex-col items-center text-center">
                <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
                <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                  Something Went Wrong
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  The application encountered an unexpected error. Please try
                  refreshing the page or contact support if the problem
                  persists.
                </p>
                {process.env.NODE_ENV === "development" && this.state.error && (
                  <details className="w-full mb-4 p-3 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800 text-left">
                    <summary className="cursor-pointer font-mono text-xs text-red-700 dark:text-red-400 mb-2">
                      Error Details
                    </summary>
                    <pre className="text-xs overflow-auto max-h-48 text-gray-700 dark:text-gray-300">
                      {this.state.error.message}
                      {"\n"}
                      {this.state.error.stack}
                    </pre>
                  </details>
                )}
                <Button onClick={this.handleReset} className="w-full">
                  Reload Application
                </Button>
              </div>
            </Card>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
