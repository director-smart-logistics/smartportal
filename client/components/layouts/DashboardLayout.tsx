import { AppNavbar } from "@/components/layouts/AppNavbar";
import { AppBreadcrumb } from "@/components/layouts/AppBreadcrumb";

interface DashboardLayoutProps {
  children: React.ReactNode;
  hideBreadcrumb?: boolean;
  fullHeight?: boolean;
  hideNavbar?: boolean;
}

export function DashboardLayout({
  children,
  hideBreadcrumb,
  fullHeight,
  hideNavbar,
}: DashboardLayoutProps) {
  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      {!hideNavbar && <AppNavbar />}
      <div className="flex flex-col flex-1 overflow-hidden">
        {!hideBreadcrumb && (
          <div className="hidden md:flex items-center h-10 px-6 border-b bg-background shrink-0">
            <AppBreadcrumb />
          </div>
        )}
        <main
          id="main-content"
          className={
            fullHeight
              ? "flex-1 flex flex-col overflow-hidden"
              : "flex-1 overflow-y-auto [-webkit-overflow-scrolling:touch]"
          }
          tabIndex={-1}
          data-testid="main-content"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
