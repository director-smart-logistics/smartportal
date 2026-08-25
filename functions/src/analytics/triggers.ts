import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { db } from "../config/firebase";
import { FieldValue } from "firebase-admin/firestore";

const COUNTER_DOC_PATH = "metadata/dashboard_counters";

// Trigger for Packages
export const onDashboardPackageWritten = onDocumentWritten(
  {
    document: "packages/{pkgId}",
    database: "portal",
    region: "us-central1",
  },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();

    const updatePayload: Record<string, any> = {};

    if (!before && after) {
      // Create
      updatePayload.totalPackages = FieldValue.increment(1);
      const status = after.status || "pending";
      updatePayload[`statusBreakdown.${status}`] = FieldValue.increment(1);
      if (status === "delivered") {
        updatePayload.deliveredPackages = FieldValue.increment(1);
      } else if (status === "pending") {
        updatePayload.pendingPackages = FieldValue.increment(1);
      }
    } else if (before && !after) {
      // Delete
      updatePayload.totalPackages = FieldValue.increment(-1);
      const status = before.status || "pending";
      updatePayload[`statusBreakdown.${status}`] = FieldValue.increment(-1);
      if (status === "delivered") {
        updatePayload.deliveredPackages = FieldValue.increment(-1);
      } else if (status === "pending") {
        updatePayload.pendingPackages = FieldValue.increment(-1);
      }
    } else if (before && after) {
      // Update
      const beforeStatus = before.status || "pending";
      const afterStatus = after.status || "pending";

      if (beforeStatus !== afterStatus) {
        updatePayload[`statusBreakdown.${beforeStatus}`] = FieldValue.increment(-1);
        updatePayload[`statusBreakdown.${afterStatus}`] = FieldValue.increment(1);

        if (beforeStatus === "delivered") {
          updatePayload.deliveredPackages = FieldValue.increment(-1);
        } else if (beforeStatus === "pending") {
          updatePayload.pendingPackages = FieldValue.increment(-1);
        }

        if (afterStatus === "delivered") {
          updatePayload.deliveredPackages = FieldValue.increment(1);
        } else if (afterStatus === "pending") {
          updatePayload.pendingPackages = FieldValue.increment(1);
        }
      }
    }

    if (Object.keys(updatePayload).length > 0) {
      try {
        await db.doc(COUNTER_DOC_PATH).update(updatePayload);
      } catch (err) {
        logger.warn("[onDashboardPackageWritten] Failed to update counters, attempting set merge", err);
        try {
          await db.doc(COUNTER_DOC_PATH).set(updatePayload, { merge: true });
        } catch (setErr) {
          logger.error("[onDashboardPackageWritten] Critical failure updating dashboard counters", setErr);
        }
      }
    }
  }
);

// Trigger for Customers
export const onDashboardCustomerWritten = onDocumentWritten(
  {
    document: "customers/{customerId}",
    database: "portal",
    region: "us-central1",
  },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();

    const updatePayload: Record<string, any> = {};

    if (!before && after) {
      updatePayload.totalCustomers = FieldValue.increment(1);
    } else if (before && !after) {
      updatePayload.totalCustomers = FieldValue.increment(-1);
    }

    if (Object.keys(updatePayload).length > 0) {
      try {
        await db.doc(COUNTER_DOC_PATH).update(updatePayload);
      } catch (err) {
        try {
          await db.doc(COUNTER_DOC_PATH).set(updatePayload, { merge: true });
        } catch (setErr) {
          logger.error("[onDashboardCustomerWritten] Critical failure updating dashboard counters", setErr);
        }
      }
    }
  }
);

// Trigger for Invoices
export const onDashboardInvoiceWritten = onDocumentWritten(
  {
    document: "invoices/{invoiceId}",
    database: "portal",
    region: "us-central1",
  },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();

    const updatePayload: Record<string, any> = {};

    if (!before && after) {
      updatePayload.totalInvoices = FieldValue.increment(1);
    } else if (before && !after) {
      updatePayload.totalInvoices = FieldValue.increment(-1);
    }

    if (Object.keys(updatePayload).length > 0) {
      try {
        await db.doc(COUNTER_DOC_PATH).update(updatePayload);
      } catch (err) {
        try {
          await db.doc(COUNTER_DOC_PATH).set(updatePayload, { merge: true });
        } catch (setErr) {
          logger.error("[onDashboardInvoiceWritten] Critical failure updating dashboard counters", setErr);
        }
      }
    }
  }
);
