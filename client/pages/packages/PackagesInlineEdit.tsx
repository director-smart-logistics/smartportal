import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { PackagesDataTable } from "@/components/packages/PackagesDataTable";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api/api-client";

export default function PackagesInlineEdit() {
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchPackages = async () => {
    setLoading(true);
    try {
      const result = await apiClient.get<any>("/packages");

      if (result.data) {
        setPackages(result.data.data || result.data);
      } else {
        toast({
          title: "Error",
          description: "Failed to fetch packages",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error fetching packages:", error);
      toast({
        title: "Error",
        description: "Failed to load packages",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPackages();
  }, []);

  const handleUpdate = async (id: string, field: string, value: string | number) => {
    try {
      const result = await apiClient.patch(`/packages/${id}`, { [field]: value });

      if (result.error) {
        throw new Error(result.error);
      }

      // Refresh packages list
      await fetchPackages();
    } catch (error) {
      console.error("Update error:", error);
      throw error;
    }
  };

  const handleBulkUpdate = async (id: string, updates: Record<string, any>) => {
    try {
      const result = await apiClient.patch(`/packages/${id}/bulk`, updates);

      if (result.error) {
        throw new Error(result.error);
      }

      // Refresh packages list
      await fetchPackages();
    } catch (error) {
      console.error("Bulk update error:", error);
      throw error;
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Packages</h1>
            <p className="text-gray-600 mt-1">
              Manage packages with inline editing capabilities
            </p>
          </div>
          <Button
            onClick={fetchPackages}
            disabled={loading}
            variant="outline"
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Packages Table */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
          </div>
        ) : (
          <PackagesDataTable
            packages={packages}
            onUpdate={handleUpdate}
            onBulkUpdate={handleBulkUpdate}
            loading={loading}
          />
        )}

        {/* Instructions */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
          <h3 className="font-semibold text-blue-900 mb-2">Quick Edit Instructions</h3>
          <ul className="list-disc list-inside space-y-1 text-blue-800">
            <li>
              <strong>Hover</strong> over any row to see edit icons next to editable fields
            </li>
            <li>
              <strong>Customer Name:</strong> Click to open autocomplete modal and link to customer account
            </li>
            <li>
              <strong>Origin/Destination/Weight/Cost:</strong> Click edit icon for inline editing
            </li>
            <li>
              <strong>Status:</strong> Click edit icon to select from dropdown
            </li>
            <li>
              <strong>Keyboard shortcuts:</strong> Press Enter to save, Escape to cancel
            </li>
            <li>
              Changes require confirmation before saving to database
            </li>
          </ul>
        </div>
      </div>
    </DashboardLayout>
  );
}
