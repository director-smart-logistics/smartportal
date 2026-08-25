import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import enCommon from "./en/common.json";
import esCommon from "./es/common.json";
import enAuth from "./en/auth.json";
import esAuth from "./es/auth.json";
import enDashboard from "./en/dashboard.json";
import esDashboard from "./es/dashboard.json";
import enPackages from "./en/packages.json";
import esPackages from "./es/packages.json";

import enProfile from "./en/profile.json";
import esProfile from "./es/profile.json";
import enDeliveries from "./en/deliveries.json";
import esDeliveries from "./es/deliveries.json";
import enTracking from "./en/tracking.json";
import esTracking from "./es/tracking.json";
import enLocations from "./en/locations.json";
import esLocations from "./es/locations.json";
import enUsers from "./en/users.json";
import esUsers from "./es/users.json";
import enCustomers from "./en/customers.json";
import esCustomers from "./es/customers.json";
import enMenu from "./en/menu.json";
import esMenu from "./es/menu.json";
import enScanner from "./en/scanner.json";
import esScanner from "./es/scanner.json";

import enInvoices from "./en/invoices.json";
import esInvoices from "./es/invoices.json";
import enRoutes from "./en/routes.json";
import esRoutes from "./es/routes.json";
import enManifests from "./en/manifests.json";
import esManifests from "./es/manifests.json";
import enPayroll from "./en/payroll.json";
import esPayroll from "./es/payroll.json";
import enEmployees from "./en/employees.json";
import esEmployees from "./es/employees.json";
import enDistribution from "./en/distribution.json";
import esDistribution from "./es/distribution.json";
import enBreadcrumbs from "./en/breadcrumbs.json";
import esBreadcrumbs from "./es/breadcrumbs.json";
import enSearch from "./en/search.json";
import esSearch from "./es/search.json";
import enAnalytics from "./en/analytics.json";
import esAnalytics from "./es/analytics.json";
import enDepartments from "./en/departments.json";
import esDepartments from "./es/departments.json";
import enPayrollReport from "./en/payrollReport.json";
import esPayrollReport from "./es/payrollReport.json";
import enSettings from "./en/settings.json";
import esSettings from "./es/settings.json";
import enQuotes from "./en/quotes.json";
import esQuotes from "./es/quotes.json";
import enPreFilters from "./en/preFilters.json";
import esPreFilters from "./es/preFilters.json";
import enNova from "./en/nova.json";
import esNova from "./es/nova.json";
import enBenefits from "./en/benefits.json";
import esBenefits from "./es/benefits.json";
import enPayrollRun from "./en/payrollRun.json";
import esPayrollRun from "./es/payrollRun.json";
import enReleaseNotes from "./en/release-notes.json";
import esReleaseNotes from "./es/release-notes.json";

export type Language = "en" | "es";

const resources = {
  en: {
    common: enCommon,
    auth: enAuth,
    dashboard: enDashboard,
    packages: enPackages,
    profile: enProfile,
    deliveries: enDeliveries,
    tracking: enTracking,
    locations: enLocations,
    users: enUsers,
    customers: enCustomers,
    menu: enMenu,
    scanner: enScanner,
    invoices: enInvoices,
    routes: enRoutes,
    manifests: enManifests,
    payroll: enPayroll,
    employees: enEmployees,
    distribution: enDistribution,
    breadcrumbs: enBreadcrumbs,
    search: enSearch,
    analytics: enAnalytics,
    departments: enDepartments,
    payrollReport: enPayrollReport,
    settings: enSettings,
    quotes: enQuotes,
    preFilters: enPreFilters,
    nova: enNova,
    benefits: enBenefits,
    payrollRun: enPayrollRun,
    'release-notes': enReleaseNotes,
  },
  es: {
    common: esCommon,
    auth: esAuth,
    dashboard: esDashboard,
    packages: esPackages,
    profile: esProfile,
    deliveries: esDeliveries,
    tracking: esTracking,
    locations: esLocations,
    users: esUsers,
    customers: esCustomers,
    menu: esMenu,
    scanner: esScanner,
    invoices: esInvoices,
    routes: esRoutes,
    manifests: esManifests,
    payroll: esPayroll,
    employees: esEmployees,
    distribution: esDistribution,
    breadcrumbs: esBreadcrumbs,
    search: esSearch,
    analytics: esAnalytics,
    departments: esDepartments,
    payrollReport: esPayrollReport,
    settings: esSettings,
    quotes: esQuotes,
    preFilters: esPreFilters,
    nova: esNova,
    benefits: esBenefits,
    payrollRun: esPayrollRun,
    'release-notes': esReleaseNotes,
  },
};

// Get system language preference (default to Spanish)
const getSystemLanguage = (): Language => {
  try {
    // Check browser language
    const browserLang = navigator.language.split("-")[0];
    return (["en", "es"].includes(browserLang) ? browserLang : "es") as Language;
  } catch {
    return "es"; // Default to Spanish
  }
};

// Get saved language from localStorage or fall back to system language (Spanish by default)
const getSavedLanguage = (): Language => {
  try {
    const saved = localStorage.getItem("language") as Language | null;
    if (saved && ["en", "es"].includes(saved)) {
      return saved;
    }
    return getSystemLanguage();
  } catch {
    return "es"; // Default to Spanish
  }
};

// Initialize i18n synchronously (blocking)
i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: getSavedLanguage(),
    fallbackLng: "es" as const,
    defaultNS: "common",
    ns: Object.keys(resources.en),
    keySeparator: false, // Disable key nesting - we use flat keys
    nsSeparator: '.', // Use dot for namespace separator (menu.dashboard)
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
    load: 'languageOnly' as const,
  });

export default i18n;
