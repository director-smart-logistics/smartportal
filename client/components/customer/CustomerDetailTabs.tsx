import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useLocale } from "@/hooks/useLocale";
import { useTheme } from "@/lib/context/ThemeContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface CustomerDetailTabsProps {
  overviewContent: React.ReactNode;
  packagesContent: React.ReactNode;
  invoicesContent?: React.ReactNode;
  quotesContent?: React.ReactNode;
  activityContent?: React.ReactNode;
  packagesCount?: number;
  invoicesCount?: number;
  quotesCount?: number;
  className?: string;
}

type TabValue = "overview" | "packages" | "invoices" | "quotes" | "activity";

export function CustomerDetailTabs({
  overviewContent,
  packagesContent,
  invoicesContent,
  quotesContent,
  activityContent,
  packagesCount = 0,
  invoicesCount = 0,
  quotesCount = 0,
  className,
}: CustomerDetailTabsProps) {
  const { t } = useLocale(["customers"]);
  const { theme } = useTheme();
  const [searchParams, setSearchParams] = useSearchParams();
  const isDark = theme === "dark";

  const tabFromUrl = (searchParams.get("tab") as TabValue) || "overview";
  const [activeTab, setActiveTab] = useState<TabValue>(tabFromUrl);

  // Sync with URL
  useEffect(() => {
    const tab = (searchParams.get("tab") as TabValue) || "overview";
    setActiveTab(tab);
  }, [searchParams]);

  const handleTabChange = (value: string) => {
    const newTab = value as TabValue;
    setActiveTab(newTab);

    // Update URL
    if (newTab === "overview") {
      searchParams.delete("tab");
    } else {
      searchParams.set("tab", newTab);
    }
    setSearchParams(searchParams, { replace: true });
  };

  return (
    <Tabs
      value={activeTab}
      onValueChange={handleTabChange}
      className={cn("w-full", className)}
      data-testid="customer-detail-tabs"
    >
      <TabsList
        className={cn(
          "w-full justify-start rounded-lg p-1",
          isDark ? "bg-gray-800" : "bg-gray-100",
        )}
      >
        <TabsTrigger
          value="overview"
          className="flex items-center gap-2"
          data-testid="tab-overview"
        >
          {t("customers.detailsPage.tabs.overview")}
        </TabsTrigger>

        <TabsTrigger
          value="packages"
          className="flex items-center gap-2"
          data-testid="tab-packages"
        >
          {t("customers.detailsPage.tabs.packages")}
          {packagesCount > 0 && (
            <Badge
              variant="secondary"
              className="ml-1 h-5 min-w-5 px-1 text-xs"
            >
              {packagesCount}
            </Badge>
          )}
        </TabsTrigger>

        {invoicesContent && (
          <TabsTrigger
            value="invoices"
            className="flex items-center gap-2"
            data-testid="tab-invoices"
          >
            {t("customers.detailsPage.tabs.invoices")}
            {invoicesCount > 0 && (
              <Badge
                variant="secondary"
                className="ml-1 h-5 min-w-5 px-1 text-xs"
              >
                {invoicesCount}
              </Badge>
            )}
          </TabsTrigger>
        )}

        {quotesContent && (
          <TabsTrigger
            value="quotes"
            className="flex items-center gap-2"
            data-testid="tab-quotes"
          >
            {t("customers.detailsPage.tabs.quotes")}
            {quotesCount > 0 && (
              <Badge
                variant="secondary"
                className="ml-1 h-5 min-w-5 px-1 text-xs"
              >
                {quotesCount}
              </Badge>
            )}
          </TabsTrigger>
        )}

        {activityContent && (
          <TabsTrigger
            value="activity"
            className="flex items-center gap-2"
            data-testid="tab-activity"
          >
            {t("customers.detailsPage.tabs.activity")}
          </TabsTrigger>
        )}
      </TabsList>

      <TabsContent
        value="overview"
        className="mt-6"
        data-testid="tabpanel-overview"
      >
        {overviewContent}
      </TabsContent>

      <TabsContent
        value="packages"
        className="mt-6"
        data-testid="tabpanel-packages"
      >
        {packagesContent}
      </TabsContent>

      {invoicesContent && (
        <TabsContent
          value="invoices"
          className="mt-6"
          data-testid="tabpanel-invoices"
        >
          {invoicesContent}
        </TabsContent>
      )}

      {quotesContent && (
        <TabsContent
          value="quotes"
          className="mt-6"
          data-testid="tabpanel-quotes"
        >
          {quotesContent}
        </TabsContent>
      )}

      {activityContent && (
        <TabsContent
          value="activity"
          className="mt-6"
          data-testid="tabpanel-activity"
        >
          {activityContent}
        </TabsContent>
      )}
    </Tabs>
  );
}
