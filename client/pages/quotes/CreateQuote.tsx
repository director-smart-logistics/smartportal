import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useTheme } from "@/lib/context/ThemeContext";
import { useAuth } from "@/hooks/useAuth";
import { useLocale } from "@/hooks/useLocale";
import { useSettings } from "@/lib/context/SettingsContext";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Logo } from "@/components/ui/logo";
import {
  Plus,
  Trash2,
  Save,
  Send,
  ArrowLeft,
  User,
  Building2,
  Search,
  Loader2,
  Sparkles,
  Info,
  Keyboard,
  Package,
  DollarSign,
  Calculator,
  RefreshCw,
  Eye,
  X,
  Printer,
  FileText,
  RotateCcw,
  CheckCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  useQuote,
  useCreateQuote,
  useUpdateQuote,
  useQuoteAISuggestions,
  useAnalyzeLead,
  useSuggestPricing,
  useAutoCompleteQuote,
  AutoCompleteQuoteResponse,
  QuoteItemInput,
  LeadInfoInput,
  CreateQuoteInput,
} from "@/lib/hooks/queries/useQuotes";
import { useCustomerSearch, useCustomer } from "@/lib/hooks/queries/useCustomers";
import { useToast } from "@/hooks/use-toast";
import { AISuggestionModal } from "@/components/quotes/AISuggestionModal";

interface LocalQuoteItem extends QuoteItemInput {
  id: string; // local ID for key purposes
}

const CreateQuote = React.memo(function CreateQuote() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const { t, language } = useLocale(['quotes', 'common']);
  const { invoiceSettings } = useSettings();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { id: quoteId } = useParams();
  const isDark = theme === "dark";

  // Refs for keyboard navigation
  const customerSearchRef = useRef<HTMLInputElement>(null);
  const customerDropdownRef = useRef<HTMLDivElement>(null);
  const leadNameRef = useRef<HTMLInputElement>(null);
  const leadEmailRef = useRef<HTMLInputElement>(null);
  const leadPhoneRef = useRef<HTMLInputElement>(null);
  const leadCompanyRef = useRef<HTMLInputElement>(null);
  const leadAddressRef = useRef<HTMLInputElement>(null);
  const leadCityRef = useRef<HTMLInputElement>(null);
  const leadTaxIdRef = useRef<HTMLInputElement>(null);
  const firstItemRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  // Queries
  const { data: existingQuote, isLoading: loadingQuote } = useQuote(quoteId);
  const { data: aiSuggestions, refetch: refetchAI, isLoading: loadingAI } = useQuoteAISuggestions(quoteId);

  // Mutations
  const createQuoteMutation = useCreateQuote();
  const updateQuoteMutation = useUpdateQuote(quoteId || "");
  const analyzeLeadMutation = useAnalyzeLead();
  const suggestPricingMutation = useSuggestPricing();
  const autoCompleteMutation = useAutoCompleteQuote();

  // Auto-complete suggestions state
  const [autoCompleteSuggestions, setAutoCompleteSuggestions] = useState<AutoCompleteQuoteResponse | null>(null);
  const [showAutoComplete, setShowAutoComplete] = useState(false);
  const [suggestionModal, setSuggestionModal] = useState<{
    open: boolean;
    suggestion?: string;
    initialData?: QuoteItemInput;
  }>({ open: false });

  // Form State
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [customerSearch, setCustomerSearch] = useState("");

  // Live Firestore search — debounced, covers full customer database
  const { results: searchResults, isLoading: loadingCustomers } = useCustomerSearch(customerSearch, 280, 20);

  // Fetch selected customer details for edit mode (existing quote pre-loads a customerId)
  const { data: selectedCustomerData } = useCustomer(selectedCustomerId, { enabled: !!selectedCustomerId });

  // Stable selected customer info — prefer data from the search result click, fall back to useCustomer
  const [selectedCustomerInfo, setSelectedCustomerInfo] = useState<{ id: string; fullName: string; email: string; slCode: string; phone?: string } | null>(null);
  const displayCustomer = selectedCustomerInfo ?? (selectedCustomerData ? { id: (selectedCustomerData as any).id, fullName: (selectedCustomerData as any).fullName ?? '', email: (selectedCustomerData as any).email ?? '', slCode: (selectedCustomerData as any).slCode ?? '', phone: (selectedCustomerData as any).phone } : null);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [isNewLead, setIsNewLead] = useState(false);
  const [customerType, setCustomerType] = useState<"individual" | "company">("individual");

  // Lead info state
  const [leadName, setLeadName] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [leadCompany, setLeadCompany] = useState("");
  const [leadAddress, setLeadAddress] = useState("");
  const [leadCity, setLeadCity] = useState("");
  const [leadCountry, setLeadCountry] = useState("");
  const [leadTaxId, setLeadTaxId] = useState("");

  // Quote items state
  const [items, setItems] = useState<LocalQuoteItem[]>([]);

  // Other state
  const [discountPercentage, setDiscountPercentage] = useState<number | "">("");
  const [currency, setCurrency] = useState("USD");
  const [validDays, setValidDays] = useState(30);
  const [notes, setNotes] = useState("");
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [leadAnalysis, setLeadAnalysis] = useState<any>(null);
  const [pricingSuggestion, setPricingSuggestion] = useState<any>(null);
  const [showPricingModal, setShowPricingModal] = useState(false);

  // Currency formatting function
  const formatCurrency = (amount: number | undefined | null, currencyCode: string = currency): string => {
    // Handle undefined, null, or NaN values
    const safeAmount = (amount === undefined || amount === null || isNaN(Number(amount))) ? 0 : Number(amount);
    
    const currencySymbols: Record<string, string> = {
      USD: '$',
      EUR: '€',
      GBP: '£',
      CRC: '₡',
      MXN: '$',
      CAD: 'C$',
      AUD: 'A$',
    };
    
    const symbol = currencySymbols[currencyCode] || currencyCode + ' ';
    return `${symbol}${safeAmount.toFixed(2)}`;
  };

  // Calculate totals
  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, item) => {
      const unitPrice = item.unitPrice || 0;
      const quantity = item.quantity || 0;
      return sum + (unitPrice * quantity);
    }, 0);
    const taxAmount = subtotal * 0.13;
    const discount = discountPercentage === "" ? 0 : (typeof discountPercentage === 'number' ? discountPercentage : 0);
    const discountAmount = (subtotal + taxAmount) * (discount / 100);
    const total = subtotal + taxAmount - discountAmount;
    return { subtotal, taxAmount, discountAmount, total };
  }, [items, discountPercentage]);

  // Load existing quote data
  useEffect(() => {
    if (existingQuote) {
      setSelectedCustomerId(existingQuote.customerId || "");
      setCustomerType(existingQuote.customerType as "individual" | "company");
      setLeadName(existingQuote.leadName || "");
      setLeadEmail(existingQuote.leadEmail || "");
      setLeadPhone(existingQuote.leadPhone || "");
      setLeadCompany(existingQuote.leadCompany || "");
      setLeadAddress(existingQuote.leadAddress || "");
      setLeadCity(existingQuote.leadCity || "");
      setLeadCountry(existingQuote.leadCountry || "");
      setLeadTaxId(existingQuote.leadTaxId || "");
      const discount = Number(existingQuote.discountPercentage) || 0;
      setDiscountPercentage(discount === 0 ? "" : discount);
      setCurrency(existingQuote.currency || "USD");
      setNotes(existingQuote.notes || "");
      setIsNewLead(!existingQuote.customerId && !!existingQuote.leadName);

      // Load items
      if (existingQuote.quoteItems) {
        setItems(existingQuote.quoteItems.map((item) => ({
          id: item.id,
          description: item.description,
          itemType: item.itemType as any,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          weight: item.weight ? Number(item.weight) : undefined,
          dimensions: item.dimensions || undefined,
          origin: item.origin || undefined,
          destination: item.destination || undefined,
        })));
      }
    }
  }, [existingQuote]);

  // In edit mode: populate search field + selectedCustomerInfo when the existing quote's customer loads
  useEffect(() => {
    if (selectedCustomerId && selectedCustomerData && !customerSearch) {
      const c = selectedCustomerData as any;
      setCustomerSearch(c.fullName ?? '');
      setSelectedCustomerInfo({ id: c.id, fullName: c.fullName ?? '', email: c.email ?? '', slCode: c.slCode ?? '', phone: c.phone });
    }
  }, [selectedCustomerId, selectedCustomerData, customerSearch]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + S: Save draft
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSaveDraft();
      }
      // Ctrl/Cmd + Enter: Send quote
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleSendQuote();
      }
      // Ctrl/Cmd + N: Add new item
      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault();
        handleAddItem();
      }
      // Ctrl/Cmd + D: Apply AI discount
      if ((e.ctrlKey || e.metaKey) && e.key === "d") {
        e.preventDefault();
        if (aiSuggestions?.discountRecommendation?.suggestedDiscount) {
          setDiscountPercentage(aiSuggestions.discountRecommendation.suggestedDiscount);
          toast({
            title: t("aiTitle"),
            description: t("aiDiscountRecommendation") + ": " + aiSuggestions.discountRecommendation.suggestedDiscount + "%",
          });
        }
      }
      // Escape: Close modals or go back
      if (e.key === "Escape") {
        if (showKeyboardHelp) {
          setShowKeyboardHelp(false);
        }
      }
      // ? : Show keyboard help
      if (e.key === "?" && !e.ctrlKey && !e.metaKey) {
        const target = e.target as HTMLElement;
        if (target.tagName !== "INPUT" && target.tagName !== "TEXTAREA") {
          setShowKeyboardHelp(true);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [aiSuggestions, showKeyboardHelp, t, toast]);

  // Focus first input on mount
  useEffect(() => {
    if (!quoteId) {
      customerSearchRef.current?.focus();
    }
  }, [quoteId]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        customerSearchRef.current &&
        !customerSearchRef.current.contains(event.target as Node) &&
        customerDropdownRef.current &&
        !customerDropdownRef.current.contains(event.target as Node)
      ) {
        setShowCustomerDropdown(false);
      }
    };

    if (showCustomerDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showCustomerDropdown]);

  // Handlers
  const handleAddItem = useCallback(() => {
    const newItem: LocalQuoteItem = {
      id: `item-${Date.now()}`,
      description: "",
      itemType: "shipping",
      quantity: 1,
      unitPrice: 0,
    };
    setItems((prev) => [...prev, newItem]);
    
    // Focus the new item description field after render
    setTimeout(() => {
      const inputs = document.querySelectorAll('[data-item-description]');
      const lastInput = inputs[inputs.length - 1] as HTMLInputElement;
      lastInput?.focus();
    }, 100);
  }, []);

  const handleRemoveItem = useCallback((itemId: string) => {
    setItems((prev) => prev.filter((item) => item.id !== itemId));
  }, []);

  // Clear customer selection
  const handleClearCustomer = useCallback(() => {
    setSelectedCustomerId("");
    setCustomerSearch("");
    setSelectedCustomerInfo(null);
    setShowCustomerDropdown(false);
  }, []);

  // Reset form
  const handleResetForm = useCallback(() => {
    setSelectedCustomerId("");
    setCustomerSearch("");
    setSelectedCustomerInfo(null);
    setIsNewLead(false);
    setItems([]);
    setDiscountPercentage("");
    setCurrency("USD");
    setValidDays(30);
    setNotes("");
    setLeadName("");
    setLeadEmail("");
    setLeadPhone("");
    setLeadCompany("");
    setLeadAddress("");
    setLeadCity("");
    setLeadCountry("");
    setLeadTaxId("");
    setCustomerType("individual");
    setShowCustomerDropdown(false);
  }, []);

  // Auto-complete quote with AI - Manually triggered, automatically applies suggestions
  const handleAutoCompleteQuote = useCallback(async () => {
    if (items.length === 0 || (!selectedCustomerId && !isNewLead)) {
      toast({
        title: t("common.error"),
        description: t("aiAutoCompleteRequiresItem") || "Please add at least one item and select a customer",
        variant: "destructive",
      });
      return;
    }

    try {
      const result = await autoCompleteMutation.mutateAsync({
        customerId: selectedCustomerId || undefined,
        language,
        leadInfo: isNewLead ? {
          name: leadName,
          email: leadEmail,
          company: leadCompany,
        } : undefined,
        currentItems: items.map((item) => ({
          description: item.description,
          itemType: item.itemType,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          weight: item.weight,
          origin: item.origin,
          destination: item.destination,
        })),
        quoteValue: totals.total,
      });

      if (!result) {
        throw new Error("AI returned no response");
      }

      // Validate result has suggestedItems
      console.log('AI Auto-Complete Response:', result);
      console.log('Suggested Items from API:', result.suggestedItems);

      // Process AI response: auto-fill existing items + add new items
      const currentItems = [...items];

      // Step 1: Auto-fill missing data in existing items
      let itemsAutofilled = 0;
      if (result.autoCompleteData && typeof result.autoCompleteData === 'object') {
        Object.entries(result.autoCompleteData).forEach(([indexStr, autoData]: [string, any]) => {
          const index = parseInt(indexStr, 10);
          if (!isNaN(index) && currentItems[index] && autoData) {
            const item = currentItems[index];
            currentItems[index] = {
              ...item,
              description: item.description?.trim() || autoData.description || "",
              itemType: item.itemType || autoData.itemType || "shipping",
              quantity: (item.quantity && item.quantity > 0) ? item.quantity : (autoData.quantity || 1),
              unitPrice: (item.unitPrice && item.unitPrice > 0) ? item.unitPrice : (autoData.unitPrice || 0),
              weight: item.weight || ((autoData.weight && autoData.weight > 0) ? autoData.weight : undefined),
              origin: item.origin?.trim() || autoData.origin || "",
              destination: item.destination?.trim() || autoData.destination || "",
            };
            itemsAutofilled++;
          }
        });
      }

      // Step 2: Create NEW visual cards from AI-suggested items
      const suggestedItems = Array.isArray(result.suggestedItems) ? result.suggestedItems : [];
      console.log('Extracted suggestedItems array:', suggestedItems);
      console.log('Array length:', suggestedItems.length);
      
      const timestamp = Date.now();
      const newItemCards: LocalQuoteItem[] = [];
      
      for (let i = 0; i < suggestedItems.length; i++) {
        const suggested = suggestedItems[i];
        console.log(`Processing suggested item ${i}:`, suggested);
        
        if (suggested && suggested.description) {
          const newItem: LocalQuoteItem = {
            id: `item-ai-${timestamp}-${i}`,
            description: suggested.description || "",
            itemType: (suggested.itemType || "shipping") as "shipping" | "handling" | "insurance" | "customs" | "other",
            quantity: suggested.quantity || 1,
            unitPrice: suggested.unitPrice || 0,
            weight: (suggested.weight && suggested.weight > 0) ? suggested.weight : undefined,
            origin: suggested.origin || "",
            destination: suggested.destination || "",
          };
          console.log('Created new item card:', newItem);
          newItemCards.push(newItem);
        }
      }

      console.log('Total new item cards created:', newItemCards.length);
      console.log('New item cards:', newItemCards);

      // Step 3: Update state with all items (existing + new AI cards)
      const finalItems = [...currentItems, ...newItemCards];
      console.log('Final items array (before setState):', finalItems);
      console.log('Final items length:', finalItems.length);
      
      setItems(finalItems);

      // Step 4: Apply discount and notes
      if (result.discountSuggestion?.percentage && result.discountSuggestion.percentage > 0) {
        setDiscountPercentage(result.discountSuggestion.percentage);
      }

      if (result.engagingNotes && typeof result.engagingNotes === 'string') {
        setNotes(result.engagingNotes);
      }

      // Step 5: Store for reference panel
      setAutoCompleteSuggestions(result);
      setShowAutoComplete(true);

      // Step 6: Scroll to show new items
      setTimeout(() => {
        if (newItemCards.length > 0) {
          const lastNewItemId = newItemCards[newItemCards.length - 1].id;
          const element = document.querySelector(`[data-item-id="${lastNewItemId}"]`);
          element?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 300);

      // Step 7: Success notification
      const summaryParts = [];
      if (newItemCards.length > 0) {
        summaryParts.push(`${newItemCards.length} new item(s) added`);
      }
      if (itemsAutofilled > 0) {
        summaryParts.push(`${itemsAutofilled} item(s) auto-filled`);
      }
      if (result.discountSuggestion?.percentage) {
        summaryParts.push(`${result.discountSuggestion.percentage}% discount applied`);
      }
      if (result.engagingNotes) {
        summaryParts.push('notes generated');
      }

      toast({
        title: t("aiTitle"),
        description: summaryParts.length > 0 ? summaryParts.join(', ') : 'AI suggestions applied',
      });

    } catch (error) {
      toast({
        title: t("common.error"),
        description: t("aiAutoCompleteError") || "Failed to generate AI suggestions",
        variant: "destructive",
      });
    }
  }, [items, selectedCustomerId, isNewLead, leadName, leadEmail, leadCompany, totals.total, autoCompleteMutation, t, toast]);

  const handleItemChange = useCallback((itemId: string, field: keyof LocalQuoteItem, value: any) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, [field]: value } : item
      )
    );
  }, []);

  const handleAnalyzeLead = async () => {
    if (!leadName) return;
    
    try {
      const result = await analyzeLeadMutation.mutateAsync({
        name: leadName,
        email: leadEmail || undefined,
        phone: leadPhone || undefined,
        company: leadCompany || undefined,
        estimatedValue: totals.total,
      });
      setLeadAnalysis(result);
    } catch (error) {
      console.error("Failed to analyze lead:", error);
    }
  };

  const handleSuggestPricing = async () => {
    if (items.length === 0) return;
    
    try {
      const result = await suggestPricingMutation.mutateAsync({
        items: items.map((item) => ({
          description: item.description,
          itemType: item.itemType,
          weight: item.weight,
          origin: item.origin,
          destination: item.destination,
          quantity: item.quantity,
        })),
        customerId: selectedCustomerId || undefined,
        language,
        currency,
      });
      setPricingSuggestion(result);
      setShowPricingModal(true);
      
      // Show success toast
      toast({
        title: t("aiTitle"),
        description: `Pricing suggestions generated for ${result.itemPrices?.length || 0} items`,
      });
    } catch (error) {
      toast({
        title: t("common.error"),
        description: "Failed to generate pricing suggestions",
        variant: "destructive",
      });
    }
  };


  const handleSaveDraft = async () => {
    if (items.length === 0) {
      toast({
        title: t("common.error"),
        description: t("selectItems"),
        variant: "destructive",
      });
      return;
    }

    const payload: CreateQuoteInput = {
      customerId: selectedCustomerId || undefined,
      customerType,
      leadInfo: isNewLead ? {
        name: leadName,
        email: leadEmail || undefined,
        phone: leadPhone || undefined,
        company: leadCompany || undefined,
        address: leadAddress || undefined,
        city: leadCity || undefined,
        country: leadCountry || undefined,
        taxId: leadTaxId || undefined,
      } : undefined,
      items: items.map(({ id, ...item }) => item),
      discountPercentage: discountPercentage === "" ? 0 : discountPercentage,
      currency,
      validDays,
      notes: notes || undefined,
    };

    try {
      if (quoteId) {
        await updateQuoteMutation.mutateAsync(payload as any);
        toast({
          title: t("common.success"),
          description: t("quoteSaved"),
        });
      } else {
        await createQuoteMutation.mutateAsync(payload);
        toast({
          title: t("common.success"),
          description: t("quoteCreated"),
        });
        navigate("/quotes");
      }
    } catch (error) {
      console.error("Failed to save quote:", error);
      toast({
        title: t("common.error"),
        description: t("failedCreate"),
        variant: "destructive",
      });
    }
  };

  const handleSendQuote = async () => {
    // First save, then mark as sent
    await handleSaveDraft();
    // The sending logic would be handled elsewhere
  };

  const isLoading = loadingQuote || loadingCustomers;
  const isSaving = createQuoteMutation.isPending || updateQuoteMutation.isPending;

  return (
    <DashboardLayout>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="p-4 md:p-6 space-y-4"
      >
        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              asChild
              className={isDark ? "hover:bg-gray-800" : "hover:bg-gray-100"}
            >
              <Link to="/quotes">
                <ArrowLeft className="h-4 w-4 mr-1" />
                {t("backToList")}
              </Link>
            </Button>
            <Separator orientation="vertical" className="h-6" />
            <h1 className={`text-xl md:text-2xl font-bold ${isDark ? "text-white" : "text-black"}`}>
              {quoteId ? t("editQuote") : t("createQuote")}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowKeyboardHelp(true)}
              className={`gap-1 ${isDark ? "border-gray-700 text-gray-300" : ""}`}
            >
              <Keyboard className="h-4 w-4" />
              <span className="hidden md:inline">{t("keyboardShortcuts")}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveDraft}
              disabled={isSaving || items.length === 0}
              className={isDark ? "border-gray-700 text-gray-300" : ""}
              data-testid="save-draft-btn"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              {t("saveDraft")}
            </Button>
            <Button
              size="sm"
              onClick={handleSendQuote}
              disabled={isSaving || items.length === 0}
              className="bg-gray-900 text-white hover:bg-gray-800"
              data-testid="send-quote-btn"
            >
              <Send className="h-4 w-4 mr-1" />
              {t("sendQuote")}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Main Form */}
          <div className="lg:col-span-2 space-y-4">
            {/* Customer Selection */}
            <Card className={`p-4 ${isDark ? "bg-gray-900 border-gray-800" : "bg-white"}`}>
              <h3 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${isDark ? "text-white" : "text-gray-900"}`}>
                <User className="h-4 w-4" />
                {t("customerDetails")}
              </h3>

              {/* Toggle between existing customer and new lead */}
              <div className="flex gap-2 mb-4">
                <Button
                  variant={isNewLead ? "outline" : "default"}
                  size="sm"
                  onClick={() => setIsNewLead(false)}
                  className={!isNewLead ? "bg-gray-900 text-white" : isDark ? "border-gray-700 text-gray-300" : ""}
                >
                  {t("selectCustomer")}
                </Button>
                <Button
                  variant={isNewLead ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setIsNewLead(true);
                    setSelectedCustomerId("");
                  }}
                  className={isNewLead ? "bg-gray-900 text-white" : isDark ? "border-gray-700 text-gray-300" : ""}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  {t("createNewLead")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetForm}
                  className={`gap-1 ${isDark ? "border-gray-700 text-gray-300 hover:bg-gray-800" : "hover:bg-gray-100"}`}
                  data-testid="reset-form-btn"
                  title={t("common.reset")}
                  aria-label={t("common.reset")}
                >
                  <RotateCcw className="h-3 w-3" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPreview(true)}
                  className={`gap-1 ml-auto ${isDark ? "border-gray-700 text-gray-300" : ""}`}
                  data-testid="preview-quote-btn"
                >
                  <Eye className="h-3 w-3" />
                  {t("previewQuote")}
                </Button>
              </div>

              {!isNewLead ? (
                /* Existing Customer Selection - Typeahead Autocomplete Dropdown */
                <div className="relative">
                  <label
                    htmlFor="customer-search"
                    className={`block text-sm font-medium mb-2 ${isDark ? "text-gray-300" : "text-gray-700"}`}
                  >
                    {t("selectCustomer")}
                  </label>
                  <div className="relative mb-3">
                    <div className="relative">
                      <Input
                        id="customer-search"
                        ref={customerSearchRef}
                        placeholder={t("searchByName")}
                        value={customerSearch}
                        onChange={(e) => {
                          setCustomerSearch(e.target.value);
                          setShowCustomerDropdown(true);
                        }}
                        onFocus={() => {
                          if (customerSearch || searchResults.length > 0) {
                            setShowCustomerDropdown(true);
                          }
                        }}
                        onBlur={() => {
                          // Delay to allow click on dropdown items
                          setTimeout(() => setShowCustomerDropdown(false), 200);
                        }}
                        className={`pr-8 ${isDark ? "bg-gray-800 border-gray-700 text-white" : ""}`}
                        aria-label={t("accessibilityCustomerSearch")}
                        data-testid="customer-search-input"
                        aria-expanded={showCustomerDropdown}
                        aria-haspopup="listbox"
                      />
                      {selectedCustomerId && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleClearCustomer();
                          }}
                          className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-gray-200 transition-colors ${
                            isDark ? "hover:bg-gray-700 text-gray-400 hover:text-white" : "text-gray-500 hover:text-gray-700"
                          }`}
                          aria-label={t("common.clear")}
                          title={t("common.clear")}
                          data-testid="clear-customer-btn"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    
                    {/* Typeahead Dropdown - Only shown when typing or focused */}
                    {showCustomerDropdown && (
                      <div
                        ref={customerDropdownRef}
                        className={`absolute z-50 w-full mt-1 space-y-1 max-h-60 overflow-y-auto border rounded-lg shadow-lg p-2 ${
                          isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300 shadow-md"
                        }`}
                        role="listbox"
                        aria-label="Available customers"
                      >
                        {loadingCustomers ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                          </div>
                        ) : searchResults.length === 0 ? (
                          <p className={`text-sm py-2 px-2 ${isDark ? "text-gray-500" : "text-gray-500"}`}>
                            {customerSearch.trim().length >= 2 ? t("noCustomers") : t("searchByName")}
                          </p>
                        ) : (
                          searchResults.slice(0, 10).map((customer: any) => (
                            <button
                              key={customer.id}
                              onClick={() => {
                                setSelectedCustomerId(customer.id);
                                setCustomerSearch(customer.fullName);
                                setSelectedCustomerInfo({ id: customer.id, fullName: customer.fullName, email: customer.email ?? '', slCode: customer.slCode ?? '', phone: customer.phone });
                                setShowCustomerDropdown(false);
                              }}
                              className={`w-full text-left p-2 rounded text-sm transition-colors ${
                                selectedCustomerId === customer.id
                                  ? isDark
                                    ? "bg-blue-900 text-blue-100"
                                    : "bg-blue-100 text-blue-900"
                                  : isDark
                                    ? "hover:bg-gray-700"
                                    : "hover:bg-gray-100"
                              }`}
                              role="option"
                              aria-selected={selectedCustomerId === customer.id}
                              data-testid={`customer-option-${customer.id}`}
                            >
                              <div className="font-medium">{customer.fullName}</div>
                              <div className={`text-xs ${isDark ? "text-gray-400" : "opacity-70"}`}>
                                {customer.slCode || "N/A"} • {customer.email}
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  
                  {/* Show selected customer info if one is selected */}
                  {selectedCustomerId && !showCustomerDropdown && (() => {
                    return displayCustomer ? (
                      <div className={`mt-2 p-2 rounded border ${isDark ? "bg-gray-800 border-gray-700" : "bg-gray-50 border-gray-200"}`}>
                        <div className="text-sm font-medium">{displayCustomer.fullName}</div>
                        <div className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                          {displayCustomer.slCode || "N/A"} • {displayCustomer.email}
                        </div>
                      </div>
                    ) : null;
                  })()}
                </div>
              ) : (
                /* New Lead Form */
                <div className="space-y-4">
                  <div className="flex gap-2 mb-2">
                    <Button
                      variant={customerType === "individual" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setCustomerType("individual")}
                      className={customerType === "individual" ? "bg-gray-900 text-white" : isDark ? "border-gray-700 text-gray-300" : ""}
                    >
                      <User className="h-3 w-3 mr-1" />
                      {t("customerTypeIndividual")}
                    </Button>
                    <Button
                      variant={customerType === "company" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setCustomerType("company")}
                      className={customerType === "company" ? "bg-gray-900 text-white" : isDark ? "border-gray-700 text-gray-300" : ""}
                    >
                      <Building2 className="h-3 w-3 mr-1" />
                      {t("customerTypeCompany")}
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                        {t("leadInfoName")} *
                      </Label>
                      <Input
                        ref={leadNameRef}
                        value={leadName}
                        onChange={(e) => setLeadName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            leadEmailRef.current?.focus();
                          }
                        }}
                        placeholder={t("leadInfoNamePlaceholder")}
                        className={`mt-1 ${isDark ? "bg-gray-800 border-gray-700 text-white" : ""}`}
                        data-testid="lead-name"
                        required
                      />
                    </div>
                    <div>
                      <Label className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                        {t("leadInfoEmail")}
                      </Label>
                      <Input
                        ref={leadEmailRef}
                        type="email"
                        value={leadEmail}
                        onChange={(e) => setLeadEmail(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            leadPhoneRef.current?.focus();
                          }
                        }}
                        placeholder={t("leadInfoEmailPlaceholder")}
                        className={`mt-1 ${isDark ? "bg-gray-800 border-gray-700 text-white" : ""}`}
                        data-testid="lead-email"
                      />
                    </div>
                    <div>
                      <Label className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                        {t("leadInfoPhone")}
                      </Label>
                      <Input
                        ref={leadPhoneRef}
                        value={leadPhone}
                        onChange={(e) => setLeadPhone(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            leadCompanyRef.current?.focus();
                          }
                        }}
                        placeholder={t("leadInfoPhonePlaceholder")}
                        className={`mt-1 ${isDark ? "bg-gray-800 border-gray-700 text-white" : ""}`}
                        data-testid="lead-phone"
                      />
                    </div>
                    <div>
                      <Label className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                        {t("leadInfoCompany")}
                      </Label>
                      <Input
                        ref={leadCompanyRef}
                        value={leadCompany}
                        onChange={(e) => setLeadCompany(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            leadAddressRef.current?.focus();
                          }
                        }}
                        placeholder={t("leadInfoCompanyPlaceholder")}
                        className={`mt-1 ${isDark ? "bg-gray-800 border-gray-700 text-white" : ""}`}
                        data-testid="lead-company"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                        {t("leadInfoAddress")}
                      </Label>
                      <Input
                        ref={leadAddressRef}
                        value={leadAddress}
                        onChange={(e) => setLeadAddress(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            leadCityRef.current?.focus();
                          }
                        }}
                        placeholder={t("leadInfoAddressPlaceholder")}
                        className={`mt-1 ${isDark ? "bg-gray-800 border-gray-700 text-white" : ""}`}
                        data-testid="lead-address"
                      />
                    </div>
                    <div>
                      <Label className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                        {t("leadInfoCity")}
                      </Label>
                      <Input
                        ref={leadCityRef}
                        value={leadCity}
                        onChange={(e) => setLeadCity(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            leadTaxIdRef.current?.focus();
                          }
                        }}
                        placeholder={t("leadInfoCityPlaceholder")}
                        className={`mt-1 ${isDark ? "bg-gray-800 border-gray-700 text-white" : ""}`}
                        data-testid="lead-city"
                      />
                    </div>
                    <div>
                      <Label className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                        {t("leadInfoTaxId")}
                      </Label>
                      <Input
                        ref={leadTaxIdRef}
                        value={leadTaxId}
                        onChange={(e) => setLeadTaxId(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            // Focus first item description if items exist, otherwise focus add item button
                            const firstItemDesc = document.querySelector('[data-item-description]') as HTMLInputElement;
                            if (firstItemDesc) {
                              firstItemDesc.focus();
                            } else {
                              handleAddItem();
                              setTimeout(() => {
                                const firstItem = document.querySelector('[data-item-description]') as HTMLInputElement;
                                firstItem?.focus();
                              }, 100);
                            }
                          }
                        }}
                        placeholder={t("leadInfoTaxIdPlaceholder")}
                        className={`mt-1 ${isDark ? "bg-gray-800 border-gray-700 text-white" : ""}`}
                        data-testid="lead-tax-id"
                      />
                    </div>
                  </div>

                  {/* Analyze Lead Button */}
                  {leadName && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleAnalyzeLead}
                      disabled={analyzeLeadMutation.isPending}
                      className={`gap-1 ${isDark ? "border-gray-700 text-gray-300" : ""}`}
                    >
                      {analyzeLeadMutation.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Sparkles className="h-3 w-3" />
                      )}
                      {t("aiLeadAnalysis")}
                    </Button>
                  )}

                  {/* Lead Analysis Result */}
                  {leadAnalysis && (
                    <div className={`p-3 rounded-md border ${isDark ? "bg-gray-800 border-gray-700" : "bg-blue-50 border-blue-200"}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="h-4 w-4 text-yellow-500" />
                        <span className={`text-sm font-medium ${isDark ? "text-white" : "text-gray-900"}`}>
                          {t("aiLeadAnalysis")}
                        </span>
                        <Badge className={
                          leadAnalysis.category === 'hot' ? "bg-red-500" :
                          leadAnalysis.category === 'warm' ? "bg-yellow-500" : "bg-blue-500"
                        }>
                          {t(`ai.${leadAnalysis.category}`)}
                        </Badge>
                      </div>
                      <div className={`text-xs space-y-1 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                        <p>{t("aiLeadScore")}: <span className="font-semibold">{leadAnalysis.leadScore}%</span></p>
                        <p>{t("aiFollowUp")}: {leadAnalysis.suggestedFollowUp}</p>
                        {leadAnalysis.recommendations?.map((rec: string, i: number) => (
                          <p key={i}>• {rec}</p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Card>

            {/* Quote Items */}
            <Card className={`p-4 ${isDark ? "bg-gray-900 border-gray-800" : "bg-white"}`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className={`text-sm font-semibold flex items-center gap-2 ${isDark ? "text-white" : "text-gray-900"}`}>
                  <Package className="h-4 w-4" />
                  {t("items")}
                </h3>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAutoCompleteQuote}
                    disabled={items.length === 0 || (!selectedCustomerId && !isNewLead) || autoCompleteMutation.isPending}
                    className={`gap-1 ${isDark ? "border-gray-700 text-gray-300" : ""}`}
                    title={t("aiAutoCompleteTooltip") || "AI will analyze items, automatically add suggested items, fill missing data, and generate notes"}
                  >
                    {autoCompleteMutation.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                    {t("aiAutoComplete") || "AI Auto-Complete"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSuggestPricing}
                    disabled={items.length === 0 || suggestPricingMutation.isPending}
                    className={`gap-1 ${isDark ? "border-gray-700 text-gray-300" : ""}`}
                  >
                    {suggestPricingMutation.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Calculator className="h-3 w-3" />
                    )}
                    {t("aiPricingSuggestion")}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleAddItem}
                    className="bg-gray-900 text-white hover:bg-gray-800"
                    data-testid="add-item-btn"
                    aria-label={t("accessibilityAddItemButton")}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    {t("addItem")}
                  </Button>
                </div>
              </div>

              {/* Items List */}
              {items.length === 0 ? (
                <div className={`text-center py-8 border-2 border-dashed rounded-lg ${isDark ? "border-gray-700 text-gray-500" : "border-gray-300 text-gray-400"}`}>
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">{t("noItemsSelected")}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleAddItem}
                    className="mt-2"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    {t("addItem")}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {items.map((item, index) => {
                    const isAIItem = item.id.startsWith('item-ai-');
                    return (
                    <div
                      key={item.id}
                      className={`p-3 border rounded-lg ${isDark ? "border-gray-700 bg-gray-800" : "border-gray-200 bg-gray-50"} ${isAIItem ? 'ring-2 ring-blue-500 ring-opacity-50 transition-all duration-500' : ''}`}
                      data-testid={`item-${index}`}
                      data-item-id={item.id}
                    >
                      <div className="grid grid-cols-12 gap-3 items-start">
                        {/* Description - spans more columns */}
                        <div className="col-span-12 md:col-span-4">
                          <Label className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                            {t("description")}
                          </Label>
                          <Input
                            value={item.description}
                            onChange={(e) => handleItemChange(item.id, "description", e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                // Focus quantity field for this item
                                const quantityInput = e.currentTarget.closest('[data-testid^="item-"]')?.querySelector('input[type="number"][min="1"]') as HTMLInputElement;
                                quantityInput?.focus();
                              }
                            }}
                            placeholder={t("itemDescription")}
                            className={`mt-1 ${isDark ? "bg-gray-900 border-gray-600 text-white" : ""}`}
                            data-item-description
                          />
                        </div>

                        {/* Type */}
                        <div className="col-span-6 md:col-span-2">
                          <Label className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                            {t("itemType")}
                          </Label>
                          <Select
                            value={item.itemType}
                            onValueChange={(v) => handleItemChange(item.id, "itemType", v)}
                          >
                            <SelectTrigger className={`mt-1 ${isDark ? "bg-gray-900 border-gray-600 text-white" : ""}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="shipping">{t("itemTypesShipping")}</SelectItem>
                              <SelectItem value="handling">{t("itemTypesHandling")}</SelectItem>
                              <SelectItem value="insurance">{t("itemTypesInsurance")}</SelectItem>
                              <SelectItem value="customs">{t("itemTypesCustoms")}</SelectItem>
                              <SelectItem value="other">{t("itemTypesOther")}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Quantity */}
                        <div className="col-span-3 md:col-span-1">
                          <Label className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                            {t("quantity")}
                          </Label>
                          <Input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => handleItemChange(item.id, "quantity", parseInt(e.target.value) || 1)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                // Focus unit price field for this item
                                const unitPriceInput = e.currentTarget.closest('[data-testid^="item-"]')?.querySelector('input[type="number"][step="0.01"]') as HTMLInputElement;
                                unitPriceInput?.focus();
                              }
                            }}
                            className={`mt-1 ${isDark ? "bg-gray-900 border-gray-600 text-white" : ""}`}
                          />
                        </div>

                        {/* Unit Price */}
                        <div className="col-span-6 md:col-span-2">
                          <Label className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                            {t("unitPrice")}
                          </Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            value={item.unitPrice || ""}
                            onChange={(e) => handleItemChange(item.id, "unitPrice", parseFloat(e.target.value) || 0)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                // Focus weight field for this item, or add new item if last field
                                const weightInput = e.currentTarget.closest('[data-testid^="item-"]')?.querySelector('input[type="number"][step="0.1"]') as HTMLInputElement;
                                if (weightInput) {
                                  weightInput.focus();
                                } else if (index === items.length - 1) {
                                  // If last item, add new item
                                  handleAddItem();
                                }
                              }
                            }}
                            className={`mt-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${isDark ? "bg-gray-900 border-gray-600 text-white" : ""}`}
                          />
                        </div>

                        {/* Total */}
                        <div className="col-span-6 md:col-span-2">
                          <Label className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                            {t("totalPrice")}
                          </Label>
                          <div className={`mt-1 p-2 rounded border font-semibold ${isDark ? "bg-gray-900 border-gray-600 text-white" : "bg-white border-gray-200"}`}>
                            {formatCurrency((item.unitPrice || 0) * (item.quantity || 0))}
                          </div>
                        </div>

                        {/* Delete Button */}
                        <div className="col-span-6 md:col-span-1 flex items-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveItem(item.id)}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 w-full mt-1"
                            aria-label={t("accessibilityRemoveItemButton")}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Optional Fields */}
                      <div className="grid grid-cols-4 gap-3 mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                        <div>
                          <Label className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                            {t("weight")} (kg)
                          </Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.1"
                            value={item.weight || ""}
                            onChange={(e) => handleItemChange(item.id, "weight", parseFloat(e.target.value) || undefined)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                // Focus origin field or add new item if last
                                const originInput = e.currentTarget.closest('[data-testid^="item-"]')?.querySelector('input[placeholder*="Origin"], input[placeholder*="Origen"]') as HTMLInputElement;
                                if (originInput) {
                                  originInput.focus();
                                } else if (index === items.length - 1) {
                                  handleAddItem();
                                }
                              }
                            }}
                            className={`mt-1 ${isDark ? "bg-gray-900 border-gray-600 text-white" : ""}`}
                          />
                        </div>
                        <div>
                          <Label className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                            {t("origin")}
                          </Label>
                          <Input
                            value={item.origin || ""}
                            onChange={(e) => handleItemChange(item.id, "origin", e.target.value || undefined)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                const destinationInput = e.currentTarget.closest('[data-testid^="item-"]')?.querySelector('input[placeholder*="Destination"], input[placeholder*="Destino"]') as HTMLInputElement;
                                if (destinationInput) {
                                  destinationInput.focus();
                                } else if (index === items.length - 1) {
                                  handleAddItem();
                                }
                              }
                            }}
                            className={`mt-1 ${isDark ? "bg-gray-900 border-gray-600 text-white" : ""}`}
                          />
                        </div>
                        <div>
                          <Label className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                            {t("destination")}
                          </Label>
                          <Input
                            value={item.destination || ""}
                            onChange={(e) => handleItemChange(item.id, "destination", e.target.value || undefined)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                // Move to next item description or add new item if last
                                if (index < items.length - 1) {
                                  const nextItemDesc = document.querySelectorAll('[data-item-description]')[index + 1] as HTMLInputElement;
                                  nextItemDesc?.focus();
                                } else {
                                  handleAddItem();
                                  setTimeout(() => {
                                    const newItemDesc = document.querySelectorAll('[data-item-description]')[items.length] as HTMLInputElement;
                                    newItemDesc?.focus();
                                  }, 100);
                                }
                              }
                            }}
                            className={`mt-1 ${isDark ? "bg-gray-900 border-gray-600 text-white" : ""}`}
                          />
                        </div>
                        <div>
                          <Label className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                            {t("dimensions")}
                          </Label>
                          <Input
                            value={item.dimensions || ""}
                            onChange={(e) => handleItemChange(item.id, "dimensions", e.target.value || undefined)}
                            placeholder="L x W x H"
                            className={`mt-1 ${isDark ? "bg-gray-900 border-gray-600 text-white" : ""}`}
                          />
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}

            </Card>

            {/* Notes */}
            <Card className={`p-4 ${isDark ? "bg-gray-900 border-gray-800" : "bg-white"}`}>
              <Label className={`text-sm font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>
                {t("notes")}
              </Label>
              <Textarea
                ref={notesRef}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("notesPlaceholder")}
                rows={3}
                className={`mt-2 ${isDark ? "bg-gray-800 border-gray-700 text-white" : ""}`}
                data-testid="quote-notes"
              />
            </Card>
          </div>

          {/* Sidebar - Summary & AI */}
          <div className="space-y-4">
            {/* Quote Summary */}
            <Card className={`p-4 ${isDark ? "bg-gray-900 border-gray-800" : "bg-white"}`}>
              <h3 className={`text-sm font-semibold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>
                {t("quoteDetails")}
              </h3>

              <div className="space-y-3">
                {/* Discount */}
                <div>
                  <Label className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                    {t("discountPercentage")}
                  </Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={discountPercentage === "" ? "" : discountPercentage}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDiscountPercentage(val === "" ? "" : parseFloat(val) || "");
                      }}
                      className={`[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${isDark ? "bg-gray-800 border-gray-700 text-white" : ""}`}
                    />
                    <span className={`flex items-center text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>%</span>
                  </div>
                </div>

                {/* Valid Days */}
                <div>
                  <Label className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                    {t("validDays")}
                  </Label>
                  <Input
                    type="number"
                    min="1"
                    value={validDays}
                    onChange={(e) => setValidDays(parseInt(e.target.value) || 30)}
                    className={`mt-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${isDark ? "bg-gray-800 border-gray-700 text-white" : ""}`}
                  />
                </div>

                {/* Currency */}
                <div>
                  <Label className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                    {t("currency")}
                  </Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger className={`mt-1 ${isDark ? "bg-gray-800 border-gray-700 text-white" : ""}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD ($)</SelectItem>
                      <SelectItem value="EUR">EUR (€)</SelectItem>
                      <SelectItem value="CRC">CRC (₡)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Separator className={isDark ? "bg-gray-700" : ""} />

                {/* Totals */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className={isDark ? "text-gray-400" : "text-gray-600"}>{t("subtotal")}</span>
                    <span className={isDark ? "text-white" : "text-gray-900"}>{formatCurrency(totals.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className={isDark ? "text-gray-400" : "text-gray-600"}>{t("tax")} (13%)</span>
                    <span className={isDark ? "text-white" : "text-gray-900"}>{formatCurrency(totals.taxAmount)}</span>
                  </div>
                  {discountPercentage !== "" && discountPercentage > 0 && (
                    <div className="flex justify-between text-sm text-red-500">
                      <span>{t("discountAmount")} ({discountPercentage}%)</span>
                      <span>-{formatCurrency(totals.discountAmount)}</span>
                    </div>
                  )}
                  <Separator className={isDark ? "bg-gray-700" : ""} />
                  <div className="flex justify-between text-lg font-bold">
                    <span className={isDark ? "text-white" : "text-gray-900"}>{t("total")}</span>
                    <span className={isDark ? "text-green-400" : "text-green-600"}>{formatCurrency(totals.total)}</span>
                  </div>
                </div>
              </div>
            </Card>

            {/* AI Insights Panel */}
            {quoteId && (
              <Card className={`p-4 ${isDark ? "bg-gray-900 border-gray-800" : "bg-white"}`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className={`text-sm font-semibold flex items-center gap-2 ${isDark ? "text-white" : "text-gray-900"}`}>
                    <Sparkles className="h-4 w-4 text-yellow-500" />
                    {t("aiTitle")}
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => refetchAI()}
                    disabled={loadingAI}
                    className="h-7 w-7 p-0"
                  >
                    {loadingAI ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                  </Button>
                </div>

                {aiSuggestions ? (
                  <div className="space-y-3">
                    {/* Deal Score */}
                    {aiSuggestions.dealPrediction && (
                      <div>
                        <div className="flex items-center justify-between">
                          <span className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                            {t("aiDealLikelihood")}
                          </span>
                          <Badge className={
                            aiSuggestions.dealPrediction.likelihood >= 70 ? "bg-green-500" :
                            aiSuggestions.dealPrediction.likelihood >= 50 ? "bg-yellow-500" : "bg-red-500"
                          }>
                            {aiSuggestions.dealPrediction.likelihood}%
                          </Badge>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mt-1">
                          <div
                            className={`h-2 rounded-full ${
                              aiSuggestions.dealPrediction.likelihood >= 70 ? "bg-green-500" :
                              aiSuggestions.dealPrediction.likelihood >= 50 ? "bg-yellow-500" : "bg-red-500"
                            }`}
                            style={{ width: `${aiSuggestions.dealPrediction.likelihood}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Discount Recommendation */}
                    {aiSuggestions.discountRecommendation && (
                      <div className={`p-2 rounded border ${isDark ? "border-gray-700 bg-gray-800" : "border-gray-200 bg-gray-50"}`}>
                        <div className="flex items-center justify-between">
                          <span className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                            {t("aiSuggestedDiscount")}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDiscountPercentage(aiSuggestions.discountRecommendation!.suggestedDiscount)}
                            className="h-6 text-xs"
                          >
                            {aiSuggestions.discountRecommendation.suggestedDiscount}% - Apply
                          </Button>
                        </div>
                        <p className={`text-[10px] mt-1 ${isDark ? "text-gray-500" : "text-gray-500"}`}>
                          {aiSuggestions.discountRecommendation.reasoning}
                        </p>
                      </div>
                    )}

                    {/* Recommendations */}
                    {aiSuggestions.dealPrediction?.recommendations && (
                      <div>
                        <span className={`text-xs font-medium ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                          {t("aiRecommendations")}
                        </span>
                        <ul className={`text-xs mt-1 space-y-1 ${isDark ? "text-gray-500" : "text-gray-500"}`}>
                          {aiSuggestions.dealPrediction.recommendations.slice(0, 3).map((rec, i) => (
                            <li key={i}>• {rec}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className={`text-center py-4 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                    <Sparkles className="h-6 w-6 mx-auto mb-2 opacity-50" />
                    <p className="text-xs">{t("aiNoSuggestions")}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => refetchAI()}
                      disabled={loadingAI}
                      className="mt-2"
                    >
                      {loadingAI ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      ) : (
                        <Sparkles className="h-3 w-3 mr-1" />
                      )}
                      {t("aiGenerateSuggestions")}
                    </Button>
                  </div>
                )}
              </Card>
            )}
          </div>
        </div>
      </motion.div>

      {/* Pricing Suggestions Modal */}
      <Dialog
        open={!!(pricingSuggestion?.itemPrices?.length) && showPricingModal}
        onOpenChange={setShowPricingModal}
      >
        <DialogContent className={`${isDark ? "bg-gray-900 border-gray-800" : ""} max-w-4xl`}>
          <DialogHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <DialogTitle className={isDark ? "text-white" : ""}>
                {t("aiPricingSuggestion")}
              </DialogTitle>
              <DialogDescription className={isDark ? "text-gray-400" : ""}>
                {t("aiPricingSuggestionDesc", "Review and apply the suggested prices to your quote items.")}
              </DialogDescription>
            </div>
          </DialogHeader>

          {pricingSuggestion?.itemPrices?.length ? (
            <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
              {pricingSuggestion.itemPrices.map((itemPrice: any, idx: number) => (
                <div
                  key={idx}
                  className={`p-3 rounded border ${
                    isDark ? "bg-gray-800 border-gray-700" : "bg-blue-50 border-blue-200"
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <p className={`text-sm font-medium ${isDark ? "text-white" : "text-gray-900"}`}>
                      {t("item")} {idx + 1}: {itemPrice.description || items[itemPrice.itemIndex]?.description || "N/A"}
                    </p>
                    <span className="text-sm font-bold text-green-600">
                      {formatCurrency(itemPrice.suggestedPrice)}
                    </span>
                  </div>
                  <div className={`text-xs space-y-1 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                    <p>{t("aiPriceRange")}: {formatCurrency(itemPrice.minPrice)} - {formatCurrency(itemPrice.maxPrice)}</p>
                    <p>{t("aiConfidence")}: {Math.round((itemPrice.confidence || 0) * 100)}%</p>
                    {itemPrice.reasoning && (
                      <p className="italic mt-1 whitespace-pre-wrap">{itemPrice.reasoning}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3 w-full text-xs"
                    onClick={() => {
                      const targetIndex = itemPrice.itemIndex;
                      if (items[targetIndex]) {
                        handleItemChange(items[targetIndex].id, "unitPrice", itemPrice.suggestedPrice);
                        toast({
                          title: t("common.success"),
                          description: t("aiPriceApplied", { index: idx + 1, defaultValue: `Price applied to item ${idx + 1}` }),
                        });
                        setShowPricingModal(false);
                      }
                    }}
                  >
                    {t("applyPrice") || "Apply This Price"}
                  </Button>
                </div>
              ))}

              {pricingSuggestion.totalEstimate && (
                <div className={`p-3 rounded border ${isDark ? "bg-gray-800 border-gray-700" : "bg-gray-50 border-gray-200"}`}>
                  <div className={`text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                    <div className="flex justify-between mb-1">
                      <span>{t("totalEstimate") || "Total Estimate"}:</span>
                      <span className="font-bold text-green-600">
                        {formatCurrency(pricingSuggestion.totalEstimate.suggested)}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span>{t("estimateRange") || "Range"}:</span>
                      <span>{formatCurrency(pricingSuggestion.totalEstimate.min)} - {formatCurrency(pricingSuggestion.totalEstimate.max)}</span>
                    </div>
                  </div>
                  {pricingSuggestion.factors && (
                    <div className={`mt-2 text-xs ${isDark ? "text-gray-500" : "text-gray-500"}`}>
                      {pricingSuggestion.factors.customerTier && (
                        <p>{t("customerTier") || "Customer Tier"}: {pricingSuggestion.factors.customerTier}</p>
                      )}
                      {pricingSuggestion.factors.volumeDiscount > 0 && (
                        <p>{t("volumeDiscount") || "Volume Discount"}: {pricingSuggestion.factors.volumeDiscount}%</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className={isDark ? "text-gray-400 text-sm" : "text-gray-600 text-sm"}>
              {t("aiPricingNoData", "No pricing suggestions available.")}
            </p>
          )}
        </DialogContent>
      </Dialog>

      {/* Keyboard Shortcuts Modal */}
      {showKeyboardHelp && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowKeyboardHelp(false)}
        >
          <Card
            className={`w-full max-w-md p-6 ${isDark ? "bg-gray-900 border-gray-800" : "bg-white"}`}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className={`text-lg font-bold mb-4 flex items-center gap-2 ${isDark ? "text-white" : "text-gray-900"}`}>
              <Keyboard className="h-5 w-5" />
              {t("keyboardShortcuts")}
            </h2>
            <div className="space-y-3">
              {[
                { keys: "Ctrl/⌘ + S", action: t("keyboardSave") },
                { keys: "Ctrl/⌘ + Enter", action: t("keyboardSend") },
                { keys: "Ctrl/⌘ + N", action: t("keyboardNewItem") },
                { keys: "Ctrl/⌘ + D", action: t("keyboardApplyDiscount") },
                { keys: "Esc", action: t("keyboardCancel") },
              ].map((shortcut) => (
                <div key={shortcut.keys} className="flex justify-between items-center">
                  <span className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                    {shortcut.action}
                  </span>
                  <kbd className={`px-2 py-1 text-xs font-mono rounded ${isDark ? "bg-gray-800 text-gray-300" : "bg-gray-100 text-gray-700"}`}>
                    {shortcut.keys}
                  </kbd>
                </div>
              ))}
            </div>
            <Button
              className="w-full mt-4"
              onClick={() => setShowKeyboardHelp(false)}
            >
              {t("common.close")}
            </Button>
          </Card>
        </div>
      )}

      {/* Quote Preview Modal */}
      {showPreview && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto"
          onClick={() => setShowPreview(false)}
        >
          <Card
            className={`w-full max-w-2xl my-8 ${isDark ? "bg-gray-900 border-gray-800" : "bg-white"}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Preview Header */}
            <div className={`flex items-center justify-between p-4 border-b ${isDark ? "border-gray-700" : "border-gray-200"}`}>
              <h2 className={`text-lg font-bold flex items-center gap-2 ${isDark ? "text-white" : "text-gray-900"}`}>
                <FileText className="h-5 w-5" />
                {t("quotePreview")}
              </h2>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.print()}
                  className={`gap-1 ${isDark ? "border-gray-700 text-gray-300" : ""}`}
                >
                  <Printer className="h-4 w-4" />
                  {t("common.print")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPreview(false)}
                  className="h-8 w-8 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Preview Content */}
            <div className="p-6 print:p-0">
              {/* Company Header */}
              <div className="flex justify-between items-start mb-6">
                <div>
                  <Logo size="md" className="mb-2" />
                  <h3 className={`text-xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                    {t("quote")}
                  </h3>
                  <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                    {t("quoteNumber")}: <span className="font-mono">QT-{Date.now().toString().slice(-8)}</span>
                  </p>
                </div>
                <div className="text-right">
                  <Badge variant="outline" className={isDark ? "border-gray-600" : ""}>
                    {t("statusesDraft")}
                  </Badge>
                  <p className={`text-sm mt-2 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                    {t("quoteDate")}: {new Date().toLocaleDateString()}
                  </p>
                  <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                    {t("validUntil")}: {new Date(Date.now() + validDays * 24 * 60 * 60 * 1000).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <Separator className={isDark ? "bg-gray-700" : ""} />

              {/* Customer/Lead Info */}
              <div className="my-4">
                <h4 className={`text-xs font-semibold uppercase tracking-wide mb-2 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                  {t("preparedFor")}
                </h4>
                <div className={`p-3 rounded-lg ${isDark ? "bg-gray-800" : "bg-gray-50"}`}>
                  {isNewLead ? (
                    <>
                      <p className={`font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>
                        {leadName || t("leadInfoName")}
                      </p>
                      {leadCompany && (
                        <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>{leadCompany}</p>
                      )}
                      {leadEmail && (
                        <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>{leadEmail}</p>
                      )}
                      {leadPhone && (
                        <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>{leadPhone}</p>
                      )}
                      {leadAddress && (
                        <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>{leadAddress}</p>
                      )}
                      {(leadCity || leadCountry) && (
                        <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                          {[leadCity, leadCountry].filter(Boolean).join(", ")}
                        </p>
                      )}
                    </>
                  ) : selectedCustomerId ? (
                    (() => {
                      return displayCustomer ? (
                        <>
                          <p className={`font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>
                            {displayCustomer.fullName}
                          </p>
                          <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                            {displayCustomer.email}
                          </p>
                          {displayCustomer.slCode && (
                            <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                              {t("slCode")}: {displayCustomer.slCode}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className={`text-sm ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                          {t("selectACustomer")}
                        </p>
                      );
                    })()
                  ) : (
                    <p className={`text-sm ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                      {t("selectACustomer")}
                    </p>
                  )}
                </div>
              </div>

              {/* Items Table */}
              <div className="my-4">
                <h4 className={`text-xs font-semibold uppercase tracking-wide mb-2 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                  {t("items")}
                </h4>
                {items.length === 0 ? (
                  <div className={`p-6 text-center rounded-lg border-2 border-dashed ${isDark ? "border-gray-700 text-gray-500" : "border-gray-300 text-gray-400"}`}>
                    <p className="text-sm">{t("noItemsSelected")}</p>
                  </div>
                ) : (
                  <div className={`border rounded-lg overflow-hidden ${isDark ? "border-gray-700" : "border-gray-200"}`}>
                    <table className="w-full text-sm">
                      <thead className={isDark ? "bg-gray-800" : "bg-gray-50"}>
                        <tr>
                          <th className={`text-left py-2 px-3 font-semibold ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                            {t("description")}
                          </th>
                          <th className={`text-center py-2 px-3 font-semibold ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                            {t("quantity")}
                          </th>
                          <th className={`text-right py-2 px-3 font-semibold ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                            {t("unitPrice")}
                          </th>
                          <th className={`text-right py-2 px-3 font-semibold ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                            {t("totalPrice")}
                          </th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${isDark ? "divide-gray-700" : "divide-gray-200"}`}>
                        {items.map((item, index) => (
                          <tr 
                            key={item.id} 
                            className={`${index % 2 === 0 ? (isDark ? "bg-gray-900" : "bg-white") : (isDark ? "bg-gray-800/50" : "bg-gray-50")} ${item.id.startsWith('item-ai-') ? 'ring-2 ring-blue-500 ring-opacity-30' : ''}`}
                            data-item-id={item.id}
                          >
                            <td className={`py-2 px-3 ${isDark ? "text-gray-300" : "text-gray-900"}`}>
                              <div>
                                <p className="font-medium">{item.description || "-"}</p>
                                <p className={`text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                                  {(() => {
                                    const itemTypeMap: Record<string, string> = {
                                      shipping: "itemTypesShipping",
                                      handling: "itemTypesHandling",
                                      insurance: "itemTypesInsurance",
                                      customs: "itemTypesCustoms",
                                      other: "itemTypesOther",
                                    };
                                    return t(itemTypeMap[item.itemType] || "itemTypesShipping");
                                  })()}
                                  {item.origin && item.destination && ` • ${item.origin} → ${item.destination}`}
                                </p>
                              </div>
                            </td>
                            <td className={`py-2 px-3 text-center ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                              {item.quantity}
                            </td>
                            <td className={`py-2 px-3 text-right ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                              {formatCurrency(item.unitPrice || 0)}
                            </td>
                            <td className={`py-2 px-3 text-right font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>
                              {formatCurrency((item.unitPrice || 0) * (item.quantity || 0))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Totals */}
              <div className="flex justify-end my-4">
                <div className={`w-64 space-y-2 p-3 rounded-lg ${isDark ? "bg-gray-800" : "bg-gray-50"}`}>
                  <div className="flex justify-between text-sm">
                    <span className={isDark ? "text-gray-400" : "text-gray-600"}>{t("subtotal")}</span>
                    <span className={isDark ? "text-white" : "text-gray-900"}>{formatCurrency(totals.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className={isDark ? "text-gray-400" : "text-gray-600"}>{t("tax")} (13%)</span>
                    <span className={isDark ? "text-white" : "text-gray-900"}>{formatCurrency(totals.taxAmount)}</span>
                  </div>
                  {discountPercentage !== "" && discountPercentage > 0 && (
                    <div className="flex justify-between text-sm text-green-500">
                      <span>{t("discountAmount")} ({discountPercentage}%)</span>
                      <span>-{formatCurrency(totals.discountAmount)}</span>
                    </div>
                  )}
                  <Separator className={isDark ? "bg-gray-700" : ""} />
                  <div className="flex justify-between text-base font-bold">
                    <span className={isDark ? "text-white" : "text-gray-900"}>{t("total")} ({currency})</span>
                    <span className={isDark ? "text-green-400" : "text-green-600"}>{formatCurrency(totals.total)}</span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {notes && (
                <div className="my-4">
                  <h4 className={`text-xs font-semibold uppercase tracking-wide mb-2 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                    {t("notes")}
                  </h4>
                  <div className={`p-3 rounded-lg ${isDark ? "bg-gray-800" : "bg-gray-50"}`}>
                    <p className={`text-sm whitespace-pre-wrap ${isDark ? "text-gray-300" : "text-gray-700"}`}>{notes}</p>
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className={`mt-6 pt-4 border-t text-center text-xs ${isDark ? "border-gray-700 text-gray-500" : "border-gray-200 text-gray-400"}`}>
                <p>{t("validUntil")}: {new Date(Date.now() + validDays * 24 * 60 * 60 * 1000).toLocaleDateString()}</p>
                <p className="mt-1">Thank you for your business!</p>
              </div>
            </div>

            {/* Preview Footer Actions */}
            <div className={`flex justify-end gap-2 p-4 border-t ${isDark ? "border-gray-700" : "border-gray-200"}`}>
              <Button
                variant="outline"
                onClick={() => setShowPreview(false)}
                className={isDark ? "border-gray-700 text-gray-300" : ""}
              >
                {t("common.close")}
              </Button>
              <Button
                onClick={() => {
                  setShowPreview(false);
                  handleSaveDraft();
                }}
                disabled={isSaving || items.length === 0}
                className="bg-gray-900 text-white hover:bg-gray-800"
              >
                <Save className="h-4 w-4 mr-1" />
                {t("saveDraft")}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </DashboardLayout>
  );
});

export default CreateQuote;
