import { aggregateMonthlyData } from "../src/analytics/monthly-aggregation";

async function main() {
  process.env.GCLOUD_PROJECT = "smart-portal-admin";
  process.env.FIRESTORE_EMULATOR_HOST = ""; // Ensure we are testing against staging/production DB
  
  console.log("Starting aggregation test for 2026-06...");
  try {
    const data = await aggregateMonthlyData("2026-06");
    console.log("Success! Data computed successfully.");
    console.log("Total revenue computed:", data.totalRevenue);
    console.log("Total packages computed:", data.totalPackages);
    console.log("Total customers computed:", data.demographics.totalCustomers);
    console.log("Recent customers count:", data.recentCustomersCount);
    console.log("Legacy customers count:", data.legacyCustomersCount);
  } catch (err) {
    console.error("Test failed with error:", err);
  }
}

main();
