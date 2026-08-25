import React, { useState, useMemo, useCallback, useRef, useEffect, Fragment, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@/lib/context/ThemeContext";
import { useAuth } from "@/hooks/useAuth";
import { useLocale } from "@/hooks/useLocale";
import { useSettings } from "@/lib/context/SettingsContext";
import { apiClient } from "@/lib/api/api-client";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { PermissionTooltip } from "@/components/PermissionTooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SkeletonDataTable } from "@/components/SkeletonLoaders";
import {
  Plus,
  FileText,
  Search,
  Eye,
  Mail,
  MessageSquare,
  Download,
  Trash2,
  AlertCircle,
  CheckCircle,
  Clock,
  DollarSign,
  X,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
  User,
  ArrowRightLeft,
  Sparkles,
  TrendingUp,
  Ban,
  Send,
} from "lucide-react";
import { 
  useQuotes, 
  useDeleteQuote,
  useMarkQuoteSent,
  useMarkQuoteAccepted,
  useMarkQuoteRejected,
  useConvertQuoteToInvoice,
  useGenerateQuotePdf,
  Quote,
  QuotesResponse,
} from "@/lib/hooks/queries/useQuotes";
import { useToast } from "@/hooks/use-toast";

type QuoteStatus = "draft" | "sent" | "accepted" | "rejected" | "expired" | "converted";

const Quotes = memo(function Quotes() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const { t } = useLocale(['quotes', 'common']);
  const { invoiceSettings } = useSettings();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isDark = theme === "dark";
  const { canCreate, canUpdate, canDelete } = usePermissions();

  // State
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | QuoteStatus>("all");
  const [pageIndex, setPageIndex] = useState(0);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [generatingPDFId, setGeneratingPDFId] = useState<string | null>(null);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    show: boolean;
    type: string;
    quoteId: string;
    quoteNumber: string;
    data?: any;
  } | null>(null);

  const pageSize = 25;

  // Queries
  const { data: quotesResp, isLoading } = useQuotes({
    status: statusFilter === "all" ? undefined : statusFilter,
    search: searchTerm || undefined,
    skip: pageIndex * pageSize,
    take: pageSize,
  });

  // Mutations
  const deleteQuoteMutation = useDeleteQuote();
  const markSentMutation = useMarkQuoteSent("");
  const markAcceptedMutation = useMarkQuoteAccepted("");
  const markRejectedMutation = useMarkQuoteRejected("");
  const convertToInvoiceMutation = useConvertQuoteToInvoice("");

  // Handle nested API response structure: { data: { data: Quote[], meta: {...} } }
  const rawData = (quotesResp as any)?.data;
  const quotes: Quote[] = Array.isArray(rawData) 
    ? rawData 
    : Array.isArray(rawData?.data) 
      ? rawData.data 
      : [];
  const totalQuotes = (rawData as any)?.meta?.total || (quotesResp as any)?.meta?.total || quotes.length;
  const totalPages = Math.ceil(totalQuotes / pageSize);

  // Filter quotes locally for instant feedback
  const filteredQuotes = useMemo(() => {
    return quotes.filter(quote => {
      if (!searchTerm) return true;
      const search = searchTerm.toLowerCase();
      return (
        quote.quoteNumber.toLowerCase().includes(search) ||
        quote.leadName?.toLowerCase().includes(search) ||
        quote.leadEmail?.toLowerCase().includes(search) ||
        quote.customer?.fullName?.toLowerCase().includes(search) ||
        quote.customer?.email?.toLowerCase().includes(search)
      );
    });
  }, [quotes, searchTerm]);

  const getStatusTranslation = (status: string) => {
    const statusMap: Record<string, string> = {
      draft: "statusesDraft",
      sent: "statusesSent",
      accepted: "statusesAccepted",
      rejected: "statusesRejected",
      expired: "statusesExpired",
      converted: "statusesConverted",
    };
    return t(statusMap[status] || "statusesDraft");
  };

  // Currency formatting function - formats based on quote's currency
  const formatCurrency = (amount: number, currencyCode: string = "USD"): string => {
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
    return `${symbol}${amount.toFixed(2)}`;
  };

  const getStatusColor = (status: QuoteStatus) => {
    switch (status) {
      case "draft":
        return isDark ? "bg-gray-700 text-gray-100" : "bg-gray-200 text-gray-800";
      case "sent":
        return isDark ? "bg-blue-900 text-blue-100" : "bg-blue-100 text-blue-800";
      case "accepted":
        return isDark ? "bg-green-900 text-green-100" : "bg-green-100 text-green-800";
      case "rejected":
        return isDark ? "bg-red-900 text-red-100" : "bg-red-100 text-red-800";
      case "expired":
        return isDark ? "bg-yellow-900 text-yellow-100" : "bg-yellow-100 text-yellow-800";
      case "converted":
        return isDark ? "bg-purple-900 text-purple-100" : "bg-purple-100 text-purple-800";
      default:
        return "";
    }
  };

  const getStatusIcon = (status: QuoteStatus) => {
    switch (status) {
      case "draft":
        return <Clock className="h-3.5 w-3.5" />;
      case "sent":
        return <Send className="h-3.5 w-3.5" />;
      case "accepted":
        return <CheckCircle className="h-3.5 w-3.5" />;
      case "rejected":
        return <Ban className="h-3.5 w-3.5" />;
      case "expired":
        return <AlertCircle className="h-3.5 w-3.5" />;
      case "converted":
        return <ArrowRightLeft className="h-3.5 w-3.5" />;
      default:
        return null;
    }
  };

  const handleGeneratePDF = async (quoteId: string) => {
    setGeneratingPDFId(quoteId);
    try {
      const response: any = await apiClient.post(`/quotes/${quoteId}/generate-pdf`, {});
      
      if (response?.pdf) {
        const base64Data = response.pdf;
        const filename = response.filename || `quote-${quoteId}.pdf`;
        
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/pdf' });
        
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        window.URL.revokeObjectURL(url);
      }

      toast({
        title: t("common.success"),
        description: t("pdfDownloaded"),
      });
    } catch (error) {
      console.error("Failed to generate PDF:", error);
      toast({
        title: t("common.error"),
        description: t("failedPDF"),
        variant: "destructive",
      });
    } finally {
      setGeneratingPDFId(null);
    }
  };

  const handleStatusChange = async (quoteId: string, newStatus: QuoteStatus) => {
    setUpdatingStatusId(quoteId);
    try {
      await apiClient.patch(`/quotes/${quoteId}`, { status: newStatus });
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      queryClient.invalidateQueries({ queryKey: ['quote', quoteId] });
      toast({
        title: t("common.success"),
        description: t("statusUpdated"),
      });
    } catch (error) {
      console.error("Failed to update status:", error);
      toast({
        title: t("common.error"),
        description: t("failedStatusUpdate"),
        variant: "destructive",
      });
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const handleDeleteQuote = async (quoteId: string) => {
    try {
      await deleteQuoteMutation.mutateAsync(quoteId);
      toast({
        title: t("common.success"),
        description: t("quoteDeleted"),
      });
    } catch (error) {
      console.error("Failed to delete quote:", error);
      toast({
        title: t("common.error"),
        description: t("failedDelete"),
        variant: "destructive",
      });
    }
  };

  const handleConvertToInvoice = async (quoteId: string, createCustomer: boolean = false) => {
    try {
      await apiClient.post(`/quotes/${quoteId}/convert`, { createCustomer });
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast({
        title: t("common.success"),
        description: t("quoteConverted"),
      });
    } catch (error: any) {
      console.error("Failed to convert quote:", error);
      toast({
        title: t("common.error"),
        description: error?.response?.data?.message || t("failedConvert"),
        variant: "destructive",
      });
    }
  };

  const handleCopyEmail = async (email: string, quoteId: string) => {
    try {
      await navigator.clipboard.writeText(email);
      setCopiedEmail(quoteId);
      setTimeout(() => setCopiedEmail(null), 2000);
    } catch (error) {
      console.error("Failed to copy email:", error);
    }
  };

  const toggleRowExpansion = (quoteId: string) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(quoteId)) {
        newSet.delete(quoteId);
      } else {
        newSet.add(quoteId);
      }
      return newSet;
    });
  };

  const showConfirmation = (type: string, quoteId: string, quoteNumber: string, data?: any) => {
    setConfirmAction({
      show: true,
      type,
      quoteId,
      quoteNumber,
      data,
    });
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;

    const { type, quoteId, quoteNumber, data } = confirmAction;

    try {
      switch (type) {
        case 'pdf':
          setConfirmAction(null);
          await handleGeneratePDF(quoteId);
          break;
        case 'delete':
          setConfirmAction(null);
          await handleDeleteQuote(quoteId);
          break;
        case 'status':
          setConfirmAction(null);
          await handleStatusChange(quoteId, data?.newStatus);
          break;
        case 'convert':
          setConfirmAction(null);
          await handleConvertToInvoice(quoteId, data?.createCustomer);
          break;
        default:
          setConfirmAction(null);
      }
    } catch (error) {
      console.error('Action failed:', error);
      setConfirmAction(null);
    }
  };

  const getCustomerName = (quote: Quote) => {
    return quote.customer?.fullName || quote.leadName || t("common.unknown");
  };

  const getCustomerEmail = (quote: Quote) => {
    return quote.customer?.email || quote.leadEmail || "";
  };

  // Stats
  const stats = useMemo(() => {
    const all = quotes;
    return {
      total: totalQuotes,
      draft: all.filter(q => q.status === 'draft').length,
      sent: all.filter(q => q.status === 'sent').length,
      accepted: all.filter(q => q.status === 'accepted').length,
      totalValue: all.filter(q => q.status === 'accepted' || q.status === 'converted')
        .reduce((sum, q) => sum + Number(q.totalAmount), 0),
    };
  }, [quotes, totalQuotes]);

  // Check permission
  if (user?.role !== "ADMIN" && user?.role !== "MANAGER" && user?.role !== "AGENT") {
    return (
      <DashboardLayout>
        <div className="p-6 md:p-8">
          <Card className={`p-8 text-center ${isDark ? "bg-gray-800 border-gray-700" : "bg-gray-100 border-gray-300"}`}>
            <AlertCircle className={`h-12 w-12 mx-auto mb-4 ${isDark ? "text-gray-400" : "text-gray-600"}`} />
            <h2 className={`text-xl font-bold mb-2 ${isDark ? "text-white" : "text-black"}`}>
              {t("accessDenied")}
            </h2>
            <p className={isDark ? "text-gray-400" : "text-gray-600"}>{t("accessDeniedDescription")}</p>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="p-4 md:p-6 space-y-4"
      >
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
          className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3"
        >
          <div className="space-y-1">
            <h1
              className={`text-2xl md:text-3xl font-bold ${isDark ? "text-white" : "text-black"}`}
              data-testid="quotes-page-title"
            >
              {t("title")}
            </h1>
            <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>
              {t("createAndManage")}
            </p>
          </div>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <PermissionTooltip allowed={canCreate('quotes')}>
              {canCreate('quotes') ? (
                <Button
                  asChild
                  size="sm"
                  className="flex items-center gap-2 whitespace-nowrap bg-gray-900 text-white hover:bg-gray-800"
                  aria-label={t("newQuote")}
                  data-testid="create-quote-btn"
                >
                  <Link to="/quotes/create">
                    <Plus className="h-4 w-4" />
                    {t("newQuote")}
                  </Link>
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="flex items-center gap-2 whitespace-nowrap bg-gray-900 text-white hover:bg-gray-800"
                  aria-label={t("newQuote")}
                  disabled
                >
                  <Plus className="h-4 w-4" />
                  {t("newQuote")}
                </Button>
              )}
            </PermissionTooltip>
          </motion.div>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1, ease: [0.4, 0, 0.2, 1] }}
          className="grid grid-cols-2 sm:grid-cols-5 gap-2"
          data-testid="quotes-stats"
        >
          {[
            { label: t("statisticsTotal"), value: stats.total, color: "gray", icon: FileText },
            { label: t("statisticsDraft"), value: stats.draft, color: "gray", icon: Clock },
            { label: t("statisticsSent"), value: stats.sent, color: "blue", icon: Send },
            { label: t("statisticsAccepted"), value: stats.accepted, color: "green", icon: CheckCircle },
            { label: t("statisticsTotalValue"), value: formatCurrency(stats.totalValue, "USD"), color: "purple", icon: DollarSign },
          ].map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: index * 0.05, duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
            >
              <Card className={`p-3 ${isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"}`}>
                <div className="flex items-center gap-2">
                  <stat.icon className={`h-4 w-4 ${
                    stat.color === "green" ? "text-green-600 dark:text-green-400" :
                    stat.color === "blue" ? "text-blue-600 dark:text-blue-400" :
                    stat.color === "purple" ? "text-purple-600 dark:text-purple-400" :
                    "text-gray-500"
                  }`} />
                  <div>
                    <div className={`text-[10px] font-medium text-gray-500 uppercase tracking-wide`}>
                      {stat.label}
                    </div>
                    <div className={`text-lg font-bold ${
                      stat.color === "green" ? "text-green-600 dark:text-green-400" :
                      stat.color === "blue" ? "text-blue-600 dark:text-blue-400" :
                      stat.color === "purple" ? "text-purple-600 dark:text-purple-400" :
                      isDark ? "text-white" : "text-black"
                    }`}>
                      {stat.value}
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </motion.div>

        {/* Data Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15, ease: [0.4, 0, 0.2, 1] }}
        >
          <Card className={`overflow-hidden ${isDark ? "bg-gray-900 border-gray-800" : "bg-white"}`} data-testid="quotes-datagrid">
            {/* Filters - Always visible */}
            <div
              className={`flex flex-col md:flex-row gap-2 p-3 border-b ${
                isDark ? "bg-gray-800 border-gray-700" : "bg-gray-50 border-gray-200"
              }`}
              data-testid="quotes-filters"
            >
              <div className="flex-1 relative">
                <Search className={`absolute left-2.5 top-2.5 h-3.5 w-3.5 ${isDark ? "text-gray-500" : "text-gray-400"}`} />
                <Input
                  placeholder={t("trackingPlaceholder")}
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setPageIndex(0);
                  }}
                  className={`pl-9 h-9 text-sm ${
                    isDark ? "bg-gray-900 border-gray-600 text-white placeholder:text-gray-500" : "bg-white border-gray-300"
                  }`}
                  aria-label={t("accessibilitySearchQuotes")}
                  data-testid="quote-search-input"
                />
              </div>
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value as any);
                  setPageIndex(0);
                }}
              >
                <SelectTrigger
                  className={`w-[160px] h-9 text-sm ${
                    isDark ? "bg-gray-900 border-gray-600 text-white" : "bg-white border-gray-300"
                  }`}
                  aria-label={t("accessibilityFilterByStatus")}
                  data-testid="quote-status-filter"
                >
                  <SelectValue placeholder={t("allStatus")} />
                </SelectTrigger>
                <SelectContent className={isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}>
                  <SelectItem value="all">{t("allStatus")}</SelectItem>
                  <SelectItem value="draft">
                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-gray-500" />
                      {t("statusesDraft")}
                    </div>
                  </SelectItem>
                  <SelectItem value="sent">
                    <div className="flex items-center gap-2">
                      <Send className="h-3.5 w-3.5 text-blue-500" />
                      {t("statusesSent")}
                    </div>
                  </SelectItem>
                  <SelectItem value="accepted">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                      {t("statusesAccepted")}
                    </div>
                  </SelectItem>
                  <SelectItem value="rejected">
                    <div className="flex items-center gap-2">
                      <Ban className="h-3.5 w-3.5 text-red-500" />
                      {t("statusesRejected")}
                    </div>
                  </SelectItem>
                  <SelectItem value="expired">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-3.5 w-3.5 text-yellow-500" />
                      {t("statusesExpired")}
                    </div>
                  </SelectItem>
                  <SelectItem value="converted">
                    <div className="flex items-center gap-2">
                      <ArrowRightLeft className="h-3.5 w-3.5 text-purple-500" />
                      {t("statusesConverted")}
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <SkeletonDataTable rows={10} />
            ) : filteredQuotes.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
                className="p-12 text-center"
              >
                <motion.div animate={{ y: [0, -5, 0] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}>
                  <FileText className={`h-12 w-12 mx-auto mb-4 ${isDark ? "text-gray-500" : "text-gray-400"}`} />
                </motion.div>
                <p className={isDark ? "text-gray-400" : "text-gray-600"}>
                  {t("noQuotesFound")}
                </p>
              </motion.div>
            ) : (
              <div className="flex flex-col">
                {/* Fixed Table Header */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs table-fixed" data-testid="quotes-table">
                    <colgroup><col className="w-[22%]" /><col className="w-[15%]" /><col className="w-[12%]" /><col className="w-[12%]" /><col className="w-[12%]" /><col className="w-[27%]" /></colgroup>
                    <thead className={`${isDark ? "bg-gray-800" : "bg-gray-50"}`}>
                      <tr>
                        <th className={`px-3 py-2.5 text-left text-xs font-semibold border-b ${isDark ? "text-gray-300 border-gray-700" : "text-gray-700 border-gray-200"}`}>
                          {t("quoteNumber")}
                        </th>
                        <th className={`px-3 py-2.5 text-left text-xs font-semibold border-b ${isDark ? "text-gray-300 border-gray-700" : "text-gray-700 border-gray-200"}`}>
                          {t("customer")}
                        </th>
                        <th className={`px-3 py-2.5 text-left text-xs font-semibold border-b ${isDark ? "text-gray-300 border-gray-700" : "text-gray-700 border-gray-200"}`}>
                          {t("status")}
                        </th>
                        <th className={`px-3 py-2.5 text-left text-xs font-semibold border-b ${isDark ? "text-gray-300 border-gray-700" : "text-gray-700 border-gray-200"}`}>
                          {t("amount")}
                        </th>
                        <th className={`px-3 py-2.5 text-left text-xs font-semibold border-b ${isDark ? "text-gray-300 border-gray-700" : "text-gray-700 border-gray-200"}`}>
                          {t("date")}
                        </th>
                        <th className={`px-3 py-2.5 text-left text-xs font-semibold border-b ${isDark ? "text-gray-300 border-gray-700" : "text-gray-700 border-gray-200"}`}>
                          {t("actions")}
                        </th>
                      </tr>
                    </thead>
                  </table>
                </div>

                {/* Scrollable Table Body */}
                <div className="overflow-x-auto overflow-y-auto max-h-[400px]">
                  <table className="w-full text-xs table-fixed">
                    <colgroup><col className="w-[22%]" /><col className="w-[15%]" /><col className="w-[12%]" /><col className="w-[12%]" /><col className="w-[12%]" /><col className="w-[27%]" /></colgroup>
                    <tbody className={`divide-y ${isDark ? "divide-gray-700" : "divide-gray-200"}`}>
                      {filteredQuotes.map((quote, index) => (
                        <Fragment key={quote.id}>
                          <motion.tr
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, delay: index * 0.03 }}
                            className={`transition-colors duration-150 ${isDark ? "hover:bg-gray-800" : "hover:bg-gray-50"}`}
                            data-testid={`quote-row-${quote.id}`}
                          >
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => toggleRowExpansion(quote.id)}
                                  className={`p-0.5 rounded ${isDark ? "hover:bg-gray-700 text-gray-400" : "hover:bg-gray-200 text-gray-600"}`}
                                  aria-label="Toggle details"
                                >
                                  {expandedRows.has(quote.id) ? (
                                    <ChevronDown className="h-3 w-3" />
                                  ) : (
                                    <ChevronRightIcon className="h-3 w-3" />
                                  )}
                                </button>
                                <FileText className="h-3.5 w-3.5 text-gray-500" />
                                <div className="flex flex-col min-w-0">
                                  <span className={`text-xs font-semibold truncate ${isDark ? "text-white" : "text-black"}`}>
                                    {quote.quoteNumber}
                                  </span>
                                  {quote.aiDealScore && (
                                    <div className="flex items-center gap-1 mt-0.5">
                                      <Sparkles className="h-2.5 w-2.5 text-yellow-500" />
                                      <span className="text-[10px] text-yellow-600 dark:text-yellow-400">
                                        {quote.aiDealScore}% {t("aiDealScore")}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex flex-col min-w-0">
                                <span className={`text-xs font-medium truncate ${isDark ? "text-white" : "text-black"}`}>
                                  {getCustomerName(quote)}
                                </span>
                                {getCustomerEmail(quote) && (
                                  <div className="flex items-center gap-1 mt-0.5">
                                    <span className={`text-[10px] truncate max-w-[100px] ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                                      {getCustomerEmail(quote)}
                                    </span>
                                    <button
                                      onClick={() => handleCopyEmail(getCustomerEmail(quote), quote.id)}
                                      className={`p-0.5 rounded ${isDark ? "hover:bg-gray-700 text-gray-400" : "hover:bg-gray-200 text-gray-500"}`}
                                      aria-label="Copy email"
                                    >
                                      {copiedEmail === quote.id ? (
                                        <Check className="h-2.5 w-2.5 text-green-500" />
                                      ) : (
                                        <Copy className="h-2.5 w-2.5" />
                                      )}
                                    </button>
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              {quote.status === "converted" ? (
                                <div className="flex items-center gap-1.5">
                                  {getStatusIcon(quote.status as QuoteStatus)}
                                  <Badge variant="outline" className={`text-xs ${getStatusColor(quote.status as QuoteStatus)}`}>
                                    {getStatusTranslation(quote.status)}
                                  </Badge>
                                </div>
                              ) : (
                                <Select
                                  value={quote.status}
                                  onValueChange={(newStatus) => {
                                    if (newStatus !== quote.status) {
                                      showConfirmation('status', quote.id, quote.quoteNumber, {
                                        oldStatus: quote.status,
                                        newStatus,
                                      });
                                    }
                                  }}
                                  disabled={updatingStatusId === quote.id || !canUpdate('quotes')}
                                >
                                  <SelectTrigger
                                    className={`h-8 w-[120px] text-xs font-medium border-0 focus:ring-1 focus:ring-offset-0 ${
                                      getStatusColor(quote.status as QuoteStatus)
                                    } ${updatingStatusId === quote.id ? "opacity-50 cursor-wait" : ""}`}
                                    onClick={(e) => e.stopPropagation()}
                                    aria-label={t("accessibilityStatusSelect", { quoteNumber: quote.quoteNumber })}
                                  >
                                    <div className="flex items-center gap-1.5">
                                      {updatingStatusId === quote.id ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        getStatusIcon(quote.status as QuoteStatus)
                                      )}
                                      <span>{getStatusTranslation(quote.status)}</span>
                                    </div>
                                  </SelectTrigger>
                                  <SelectContent
                                    className={`min-w-[150px] text-xs ${
                                      isDark ? "bg-gray-900 border-gray-700" : "bg-white border-gray-200"
                                    }`}
                                  >
                                    <SelectItem value="draft" className="text-xs">
                                      <div className="flex items-center gap-2">
                                        <Clock className="h-3.5 w-3.5" />
                                        {t("statusesDraft")}
                                      </div>
                                    </SelectItem>
                                    <SelectItem value="sent" className="text-xs">
                                      <div className="flex items-center gap-2">
                                        <Send className="h-3.5 w-3.5" />
                                        {t("statusesSent")}
                                      </div>
                                    </SelectItem>
                                    <SelectItem value="accepted" className="text-xs">
                                      <div className="flex items-center gap-2">
                                        <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                                        {t("statusesAccepted")}
                                      </div>
                                    </SelectItem>
                                    <SelectItem value="rejected" className="text-xs">
                                      <div className="flex items-center gap-2">
                                        <Ban className="h-3.5 w-3.5 text-red-600" />
                                        {t("statusesRejected")}
                                      </div>
                                    </SelectItem>
                                    <SelectItem value="expired" className="text-xs">
                                      <div className="flex items-center gap-2">
                                        <AlertCircle className="h-3.5 w-3.5 text-yellow-600" />
                                        {t("statusesExpired")}
                                      </div>
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                              )}
                            </td>
                            <td className={`px-3 py-2 text-xs font-semibold ${isDark ? "text-white" : "text-black"}`}>
                              {formatCurrency(Number(quote.totalAmount), quote.currency || "USD")}
                            </td>
                            <td className={`px-3 py-2 text-xs ${isDark ? "text-gray-300" : ""}`}>
                              <div className="flex flex-col">
                                <span>{new Date(quote.quoteDate).toLocaleDateString()}</span>
                                {quote.validUntil && (
                                  <span className={`text-[10px] ${
                                    new Date(quote.validUntil) < new Date() 
                                      ? "text-red-500" 
                                      : isDark ? "text-gray-500" : "text-gray-400"
                                  }`}>
                                    {new Date(quote.validUntil) < new Date()
                                      ? t("expired")
                                      : t("validUntil") + ": " + new Date(quote.validUntil).toLocaleDateString()
                                    }
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex gap-0.5 flex-wrap">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  asChild
                                  className={`h-7 w-7 p-0 ${isDark ? "hover:bg-gray-700" : "hover:bg-gray-100"}`}
                                  data-testid={`view-btn-${quote.id}`}
                                >
                                  <Link to={`/quotes/${quote.id}`} aria-label={t("accessibilityPreviewQuote", { quoteNumber: quote.quoteNumber })}>
                                    <Eye className="h-3.5 w-3.5" />
                                  </Link>
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={generatingPDFId === quote.id}
                                  className={`h-7 w-7 p-0 ${isDark ? "hover:bg-gray-700" : "hover:bg-gray-100"}`}
                                  onClick={() => handleGeneratePDF(quote.id)}
                                  aria-label={t("accessibilityGeneratePDF", { quoteNumber: quote.quoteNumber })}
                                  data-testid={`download-btn-${quote.id}`}
                                >
                                  {generatingPDFId === quote.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Download className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                                {quote.status === "accepted" && (
                                  <PermissionTooltip allowed={canUpdate('quotes')}>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      disabled={!canUpdate('quotes')}
                                      className={`h-7 w-7 p-0 ${isDark ? "hover:bg-purple-900/20 text-purple-400" : "hover:bg-purple-50 text-purple-600"}`}
                                      onClick={() => showConfirmation('convert', quote.id, quote.quoteNumber, { createCustomer: !quote.customerId })}
                                      aria-label={t("accessibilityConvertQuote", { quoteNumber: quote.quoteNumber })}
                                      data-testid={`convert-btn-${quote.id}`}
                                      title={t("confirmConvertQuote")}
                                    >
                                      <ArrowRightLeft className="h-3.5 w-3.5" />
                                    </Button>
                                  </PermissionTooltip>
                                )}
                                <PermissionTooltip allowed={canDelete('quotes')}>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={!canDelete('quotes')}
                                    className={`h-7 w-7 p-0 ${isDark ? "hover:bg-red-900/20 text-red-400" : "hover:bg-red-50 text-red-600"}`}
                                    onClick={() => showConfirmation('delete', quote.id, quote.quoteNumber)}
                                    aria-label={t("accessibilityDeleteQuote", { quoteNumber: quote.quoteNumber })}
                                    data-testid={`delete-btn-${quote.id}`}
                                    title={t("delete")}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </PermissionTooltip>
                              </div>
                            </td>
                          </motion.tr>
                          {/* Expanded Row */}
                          <tr className={isDark ? "bg-gray-900" : "bg-gray-50"}>
                            <td colSpan={6} className="p-0">
                              <AnimatePresence initial={false}>
                                {expandedRows.has(quote.id) && (
                                  <motion.div
                                    key={`expanded-${quote.id}`}
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.25 }}
                                    style={{ overflow: "hidden" }}
                                  >
                                    <div className="px-3 py-2">
                                      <div className={`grid grid-cols-1 md:grid-cols-3 gap-3 p-3 border rounded-md ${isDark ? "border-gray-700 bg-gray-800" : "border-gray-200 bg-white"}`}>
                                        {/* Customer Info */}
                                        <div>
                                          <h4 className={`text-xs font-semibold mb-2 flex items-center gap-1.5 ${isDark ? "text-white" : "text-gray-900"}`}>
                                            <User className="h-3.5 w-3.5" />
                                            {quote.customer ? t("customerDetails") : t("leadInfoTitle")}
                                          </h4>
                                          <div className={`text-xs space-y-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                                            <p><span className="font-medium">{t("leadInfoName")}:</span> {getCustomerName(quote)}</p>
                                            {getCustomerEmail(quote) && (
                                              <p><span className="font-medium">{t("leadInfoEmail")}:</span> {getCustomerEmail(quote)}</p>
                                            )}
                                            {(quote.customer?.phone || quote.leadPhone) && (
                                              <p><span className="font-medium">{t("leadInfoPhone")}:</span> {quote.customer?.phone || quote.leadPhone}</p>
                                            )}
                                            {quote.leadCompany && (
                                              <p><span className="font-medium">{t("leadInfoCompany")}:</span> {quote.leadCompany}</p>
                                            )}
                                          </div>
                                        </div>

                                        {/* Quote Items Summary */}
                                        <div>
                                          <h4 className={`text-xs font-semibold mb-2 flex items-center gap-1.5 ${isDark ? "text-white" : "text-gray-900"}`}>
                                            <FileText className="h-3.5 w-3.5" />
                                            {t("items")}
                                          </h4>
                                          <div className={`text-xs space-y-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                                            <p><span className="font-medium">{t("itemsCount", { count: quote.quoteItems?.length || 0 })}</span></p>
                                            <p><span className="font-medium">{t("subtotal")}:</span> {formatCurrency(Number(quote.subtotalAmount), quote.currency || "USD")}</p>
                                            <p><span className="font-medium">{t("tax")} (13%):</span> {formatCurrency(Number(quote.taxAmount), quote.currency || "USD")}</p>
                                            {Number(quote.discountAmount) > 0 && (
                                              <p className="text-red-500"><span className="font-medium">{t("discountAmount")}:</span> -{formatCurrency(Number(quote.discountAmount), quote.currency || "USD")}</p>
                                            )}
                                            <p className="pt-1 border-t border-gray-300 dark:border-gray-600 font-bold">
                                              <span>{t("total")}:</span> {formatCurrency(Number(quote.totalAmount), quote.currency || "USD")} ({quote.currency || "USD"})
                                            </p>
                                          </div>
                                        </div>

                                        {/* AI Insights */}
                                        {quote.aiSuggestions && (
                                          <div>
                                            <h4 className={`text-xs font-semibold mb-2 flex items-center gap-1.5 ${isDark ? "text-white" : "text-gray-900"}`}>
                                              <Sparkles className="h-3.5 w-3.5 text-yellow-500" />
                                              {t("aiTitle")}
                                          </h4>
                                          <div className={`text-xs space-y-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                                            {quote.aiDealScore && (
                                              <p>
                                                <span className="font-medium">{t("aiDealScore")}:</span>{" "}
                                                  <span className={Number(quote.aiDealScore) >= 70 ? "text-green-500" : Number(quote.aiDealScore) >= 50 ? "text-yellow-500" : "text-red-500"}>
                                                    {quote.aiDealScore}%
                                                  </span>
                                                </p>
                                              )}
                                              {(quote.aiSuggestions as any)?.dealPrediction?.recommendations?.length > 0 && (
                                                <p className="font-medium mt-1">{t("aiRecommendations")}:</p>
                                              )}
                                              {(quote.aiSuggestions as any)?.dealPrediction?.recommendations?.slice(0, 2).map((rec: string, i: number) => (
                                                <p key={i} className="text-[10px] text-gray-500">• {rec}</p>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </td>
                          </tr>
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Pagination - Always visible */}
            <div
              className={`px-3 py-2.5 border-t ${isDark ? "border-gray-700 bg-gray-800/50" : "border-gray-200 bg-gray-50"} flex flex-col md:flex-row items-start md:items-center justify-between gap-2`}
              data-testid="pagination-controls"
            >
              <div className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                {totalQuotes > 0 ? (
                  t("showingEntries", {
                    start: pageIndex * pageSize + 1,
                    end: Math.min((pageIndex + 1) * pageSize, totalQuotes),
                    total: totalQuotes,
                  })
                ) : (
                  t("noResults")
                )}
              </div>
              <div className="flex items-center gap-3">
                <div className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                  {t("page")} <span className="font-semibold">{totalPages > 0 ? pageIndex + 1 : 0}</span> / <span className="font-semibold">{totalPages || 1}</span>
                </div>
                <div className="flex gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPageIndex(0)}
                    disabled={pageIndex === 0 || totalPages === 0}
                    className={`h-7 w-7 p-0 ${isDark ? "border-gray-600 hover:bg-gray-700" : "border-gray-300 hover:bg-gray-100"}`}
                    aria-label="First page"
                    data-testid="pagination-first"
                  >
                    <ChevronLeft className="h-3 w-3" />
                    <ChevronLeft className="h-3 w-3 -ml-2" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPageIndex(Math.max(0, pageIndex - 1))}
                    disabled={pageIndex === 0 || totalPages === 0}
                    className={`h-7 px-2 text-xs ${isDark ? "border-gray-600 hover:bg-gray-700" : "border-gray-300 hover:bg-gray-100"}`}
                    aria-label={t("previous")}
                    data-testid="pagination-prev"
                  >
                    <ChevronLeft className="h-3 w-3 mr-1" />
                    {t("previous")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPageIndex(Math.min(totalPages - 1, pageIndex + 1))}
                    disabled={pageIndex >= totalPages - 1 || totalPages === 0}
                    className={`h-7 px-2 text-xs ${isDark ? "border-gray-600 hover:bg-gray-700" : "border-gray-300 hover:bg-gray-100"}`}
                    aria-label={t("next")}
                    data-testid="pagination-next"
                  >
                    {t("next")}
                    <ChevronRight className="h-3 w-3 ml-1" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPageIndex(Math.max(0, totalPages - 1))}
                    disabled={pageIndex >= totalPages - 1 || totalPages === 0}
                    className={`h-7 w-7 p-0 ${isDark ? "border-gray-600 hover:bg-gray-700" : "border-gray-300 hover:bg-gray-100"}`}
                    aria-label="Last page"
                    data-testid="pagination-last"
                  >
                    <ChevronRight className="h-3 w-3" />
                    <ChevronRight className="h-3 w-3 -ml-2" />
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </motion.div>
      </motion.div>

      {/* Confirmation Dialog */}
      <AlertDialog open={confirmAction?.show} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent className={isDark ? "bg-gray-900 border-gray-700" : ""} data-testid="confirmation-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle className={isDark ? "text-white" : ""}>
              {confirmAction?.type === 'status' && t("confirmStatusChange")}
              {confirmAction?.type === 'delete' && t("confirmDeleteTitle")}
              {confirmAction?.type === 'convert' && t("confirmConvertQuote")}
            </AlertDialogTitle>
            <AlertDialogDescription className={isDark ? "text-gray-400" : ""}>
              {confirmAction?.type === 'status' && (
                <>
                  {t("confirmStatusChangeDescription")} <span className="font-semibold">{confirmAction?.quoteNumber}</span>{" "}
                  {t("from")} <Badge variant="outline" className="mx-1">{getStatusTranslation(confirmAction?.data?.oldStatus || "")}</Badge>
                  {t("to")} <Badge variant="outline" className="mx-1">{getStatusTranslation(confirmAction?.data?.newStatus || "")}</Badge>?
                </>
              )}
              {confirmAction?.type === 'delete' && (
                <>{t("confirmDeleteDescription", { quoteNumber: confirmAction?.quoteNumber })}</>
              )}
              {confirmAction?.type === 'convert' && (
                <>{t("confirmConvertQuoteDescription")}</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-row gap-3">
            <AlertDialogCancel
              className={`flex-1 h-10 font-medium ${isDark ? "border-gray-600 text-gray-300 hover:bg-gray-800" : "border-gray-300 hover:bg-gray-100"}`}
              data-testid="confirmation-cancel-btn"
            >
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmAction}
              className={`flex-1 h-10 font-medium ${confirmAction?.type === 'delete' ? "bg-red-600 hover:bg-red-700 text-white" : "bg-gray-900 hover:bg-gray-800 text-white"}`}
              data-testid="confirmation-confirm-btn"
            >
              {confirmAction?.type === 'delete' ? t("delete") : t("common.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
});

export default Quotes;
