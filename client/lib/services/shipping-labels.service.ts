import { firebaseApi } from "../firebase/callable";

// ============================================
// Types
// ============================================

export interface ShippingLabel {
  id: string;
  labelNumber: string;
  customerId: string;
  customerName: string;
  customerSlCode: string;
  customerEmail?: string;
  customerPhone?: string;
  recipientName: string;
  recipientAddress: string;
  recipientCity: string;
  recipientState?: string;
  recipientZipCode?: string;
  recipientCountry: string;
  recipientPhone?: string;
  packageIds: string[];
  packageCount: number;
  totalWeight: number;
  totalValue?: number;
  packages: Array<{
    id: string;
    trackingNumber: string;
    description: string;
    weight: number;
    value?: number;
  }>;
  deliveryMethod: "home_delivery" | "pickup" | "route";
  routeId?: string;
  routeName?: string;
  estimatedDeliveryDate?: string;
  labelFormat: "thermal" | "standard";
  labelUrl?: string;
  barcodeData: string;
  status: "pending" | "printed" | "in_transit" | "delivered" | "cancelled";
  printedAt?: string;
  printedBy?: string;
  deliveredAt?: string;
  deliveredBy?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  cancellationReason?: string;
  notes?: string;
  deliveryInstructions?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy?: string;
  searchTokens: string[];
}

export interface CreateLabelParams {
  customerId: string;
  customerName: string;
  customerSlCode: string;
  recipientName: string;
  recipientAddress: string;
  recipientCity: string;
  recipientCountry?: string;
  recipientPhone?: string;
  packageIds: string[];
  deliveryMethod: "home_delivery" | "pickup" | "route";
  routeId?: string;
  routeName?: string;
  notes?: string;
  deliveryInstructions?: string;
}

export interface ListLabelsParams {
  page?: number;
  limit?: number;
  status?: string;
  customerId?: string;
  customerSlCode?: string;
  routeId?: string;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
}

export interface UpdateLabelStatusParams {
  labelId: string;
  status: "pending" | "printed" | "in_transit" | "delivered" | "cancelled";
  notes?: string;
}

export interface CancelLabelParams {
  labelId: string;
  reason: string;
}

// ============================================
// Service Functions
// ============================================

export const shippingLabelsService = {
  /**
   * Create a new shipping label
   */
  async createLabel(params: CreateLabelParams): Promise<ShippingLabel> {
    const result = await firebaseApi.shippingLabels.create(params);
    if (!result.success) {
      throw new Error(result.error || "Failed to create shipping label");
    }
    return result.data;
  },

  /**
   * List shipping labels with filters
   */
  async listLabels(params: ListLabelsParams = {}) {
    const result = await firebaseApi.shippingLabels.list(params);
    if (!result.success) {
      throw new Error(result.error || "Failed to list shipping labels");
    }
    return {
      labels: result.data as ShippingLabel[],
      pagination: (result as any).pagination,
    };
  },

  /**
   * Get recent labels (last 100)
   */
  async getRecentLabels(limit: number = 100) {
    return this.listLabels({ limit, page: 1 });
  },

  /**
   * Get labels for a specific customer
   */
  async getCustomerLabels(customerId: string, limit: number = 50) {
    return this.listLabels({ customerId, limit, page: 1 });
  },

  /**
   * Get labels by SL Code
   */
  async getLabelsBySlCode(slCode: string, limit: number = 50) {
    return this.listLabels({ customerSlCode: slCode, limit, page: 1 });
  },

  /**
   * Get labels for a route
   */
  async getRouteLabels(routeId: string, status?: string) {
    return this.listLabels({ routeId, status, limit: 200 });
  },

  /**
   * Update label status
   */
  async updateStatus(params: UpdateLabelStatusParams) {
    const result = await firebaseApi.shippingLabels.updateStatus(params);
    if (!result.success) {
      throw new Error(result.error || "Failed to update label status");
    }
    return result;
  },

  /**
   * Mark label as printed
   */
  async markAsPrinted(labelId: string) {
    return this.updateStatus({ labelId, status: "printed" });
  },

  /**
   * Mark label as delivered
   */
  async markAsDelivered(labelId: string, notes?: string) {
    return this.updateStatus({ labelId, status: "delivered", notes });
  },

  /**
   * Cancel a shipping label
   */
  async cancelLabel(params: CancelLabelParams) {
    const result = await firebaseApi.shippingLabels.cancel(params);
    if (!result.success) {
      throw new Error(result.error || "Failed to cancel label");
    }
    return result;
  },

  /**
   * Search labels by text
   */
  async searchLabels(query: string, limit: number = 50) {
    return this.listLabels({ q: query, limit, page: 1 });
  },

  /**
   * Get labels by status
   */
  async getLabelsByStatus(status: string, limit: number = 100) {
    return this.listLabels({ status, limit, page: 1 });
  },

  /**
   * Get labels in date range
   */
  async getLabelsInDateRange(dateFrom: string, dateTo: string, limit: number = 200) {
    return this.listLabels({ dateFrom, dateTo, limit, page: 1 });
  },
};
