import {
  createContext,
  useContext,
  ReactNode,
  useEffect,
  useState,
} from "react";

export interface SystemSettings {
  appName: string;
  baseCost: number;
  costPerKg: number;
  distanceFee: number;
  maxConsolidationWeight: number;
}

export interface InvoiceSettings {
  companyName: string;
  companyAddress: string;
  companyEmail: string;
  companyPhone: string;
  companyLogo?: string;
  invoiceSenderEmail: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioPhoneNumber: string;
  invoiceCurrency: string;
  invoiceTerms?: string;
}

interface SettingsContextType {
  settings: SystemSettings;
  invoiceSettings: InvoiceSettings;
  updateSettings: (newSettings: Partial<SystemSettings>) => Promise<void>;
  updateInvoiceSettings: (
    newSettings: Partial<InvoiceSettings>,
  ) => Promise<void>;
  calculateCost: (weight: number) => number;
  isLoading: boolean;
}

const defaultSettings: SystemSettings = {
  appName: 'SmartLogistics',
  baseCost: 5.0,
  costPerKg: 2.0,
  distanceFee: 1.5,
  maxConsolidationWeight: 100.0,
};

const defaultInvoiceSettings: InvoiceSettings = {
  companyName: "SmartLogistics",
  companyAddress: "123 Logistics Street, City, State 12345",
  companyEmail: "contact@smartlogisticscr.com",
  companyPhone: "+1 (555) 123-4567",
  invoiceSenderEmail: "invoices@smartlogisticscr.com",
  twilioAccountSid: "",
  twilioAuthToken: "",
  twilioPhoneNumber: "",
  invoiceCurrency: "USD",
  invoiceTerms: "Payment due within 30 days",
};

const SettingsContext = createContext<SettingsContextType | undefined>(
  undefined,
);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SystemSettings>(defaultSettings);
  const [invoiceSettings, setInvoiceSettings] = useState<InvoiceSettings>(
    defaultInvoiceSettings,
  );
  const [isLoading, setIsLoading] = useState(true);

  // Load settings from localStorage only (no backend needed)
  useEffect(() => {
    try {
      const stored = localStorage.getItem("systemSettings");
      if (stored) {
        const parsed = JSON.parse(stored);
        setSettings((prev) => ({ ...prev, ...parsed }));
      }

      const storedInvoice = localStorage.getItem("invoiceSettings");
      if (storedInvoice) {
        const parsed = JSON.parse(storedInvoice);
        setInvoiceSettings((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // Ignore localStorage errors
    }
    setIsLoading(false);
  }, []);

  const updateSettings = async (newSettings: Partial<SystemSettings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);

    try {
      localStorage.setItem("systemSettings", JSON.stringify(updated));
    } catch {
      // localStorage unavailable, continue anyway
    }
  };

  const updateInvoiceSettings = async (
    newSettings: Partial<InvoiceSettings>,
  ) => {
    const updated = { ...invoiceSettings, ...newSettings };
    setInvoiceSettings(updated);

    try {
      localStorage.setItem("invoiceSettings", JSON.stringify(updated));
    } catch {
      // localStorage unavailable, continue anyway
    }
  };

  const calculateCost = (weight: number): number => {
    return (
      settings.baseCost + weight * settings.costPerKg + settings.distanceFee
    );
  };

  return (
    <SettingsContext.Provider
      value={{
        settings,
        invoiceSettings,
        updateSettings,
        updateInvoiceSettings,
        calculateCost,
        isLoading,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextType {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}
