import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Package,
  Plane,
  Truck,
} from "lucide-react";

export function getStatusColor(status: string): string {
  switch (status?.toLowerCase()) {
    case "delivered":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "in_transit":
    case "transit":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "pending":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "intake":
      return "bg-purple-100 text-purple-800 border-purple-200";
    case "received":
      return "bg-slate-100 text-slate-700 border-slate-200";
    case "custom_released":
      return "bg-cyan-100 text-cyan-800 border-cyan-200";
    case "customs":
      return "bg-orange-100 text-orange-800 border-orange-200";
    case "held":
      return "bg-red-100 text-red-800 border-red-200";
    case "route":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "consolidated":
      return "bg-purple-100 text-purple-800 border-purple-200";
    case "failed":
      return "bg-red-100 text-red-800 border-red-200";
    default:
      return "bg-gray-100 text-gray-600 border-gray-200";
  }
}

export function getStatusIcon(status: string) {
  switch (status?.toLowerCase()) {
    case "delivered":
      return <CheckCircle2 className="h-3 w-3" aria-hidden="true" />;
    case "in_transit":
    case "transit":
      return <Plane className="h-3 w-3" aria-hidden="true" />;
    case "route":
      return <Truck className="h-3 w-3" aria-hidden="true" />;
    case "held":
      return <AlertTriangle className="h-3 w-3" aria-hidden="true" />;
    case "customs":
      return <FileText className="h-3 w-3" aria-hidden="true" />;
    default:
      return <Package className="h-3 w-3" aria-hidden="true" />;
  }
}
