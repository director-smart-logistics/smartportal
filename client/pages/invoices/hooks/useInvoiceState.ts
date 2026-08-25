import { useState } from 'react';
import { Invoice, InvoiceStatus } from '../types';
import type { SP1InvoiceShape } from "@/components/nova/NovaInvoicePreview";

export const useInvoiceState = () => {
  // Filters
  const [invoiceSearchTerm, setInvoiceSearchTerm] = useState("");
  const [trackingSearchResults, setTrackingSearchResults] = useState<Invoice[]>([]);
  const [trackingSearching, setTrackingSearching] = useState(false);
  const [invoiceStatusFilters, setInvoiceStatusFilters] = useState<InvoiceStatus[]>([]);
  const [statusFilterOpen, setStatusFilterOpen] = useState(false);
  const [manifestFilter, setManifestFilter] = useState("all");
  const [routeFilter, setRouteFilter] = useState("all");
  const [tempCustomerFilter, setTempCustomerFilter] = useState(false);
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined } | undefined>(undefined);
  const [groupBy, setGroupBy] = useState<'none' | 'name' | 'slCode' | 'dni' | 'email'>('none');

  // UI Expansion
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [expandedEmailLogs, setExpandedEmailLogs] = useState<Set<string>>(new Set());
  const [expandedPackageItems, setExpandedPackageItems] = useState<Set<string>>(new Set());

  // Modals & Previews
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewInvoice, setPreviewInvoice] = useState<SP1InvoiceShape | null>(null);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const [copiedInvoiceNumber, setCopiedInvoiceNumber] = useState(false);
  
  // Async operations
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [generatingPDFId, setGeneratingPDFId] = useState<string | null>(null);
  const [sendingEmailId, setSendingEmailId] = useState<string | null>(null);
  const [refreshingEmailId, setRefreshingEmailId] = useState<string | null>(null);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestingAIQuickId, setSuggestingAIQuickId] = useState<string | null>(null);
  const [sendingSMSId, setSendingSMSId] = useState<string | null>(null);
  const [changingRouteId, setChangingRouteId] = useState<string | null>(null);
  const [reassigningInvoice, setReassigningInvoice] = useState<Invoice | null>(null);
  const [isReassigning, setIsReassigning] = useState(false);
  const [reassigningManifestInvoice, setReassigningManifestInvoice] = useState<Invoice | null>(null);
  const [isReassigningManifest, setIsReassigningManifest] = useState(false);
  const [reassignResendPrompt, setReassignResendPrompt] = useState<{
    invoiceId: string;
    invoiceNumber: string;
    email: string;
    fullName: string;
  } | null>(null);
  
  return {
    invoiceSearchTerm, setInvoiceSearchTerm,
    trackingSearchResults, setTrackingSearchResults,
    trackingSearching, setTrackingSearching,
    invoiceStatusFilters, setInvoiceStatusFilters,
    statusFilterOpen, setStatusFilterOpen,
    manifestFilter, setManifestFilter,
    routeFilter, setRouteFilter,
    tempCustomerFilter, setTempCustomerFilter,
    dateRange, setDateRange,
    groupBy, setGroupBy,
    
    expandedGroups, setExpandedGroups,
    expandedRows, setExpandedRows,
    expandedEmailLogs, setExpandedEmailLogs,
    expandedPackageItems, setExpandedPackageItems,

    showCreateModal, setShowCreateModal,
    showPreviewModal, setShowPreviewModal,
    previewInvoice, setPreviewInvoice,
    copiedEmail, setCopiedEmail,
    copiedInvoiceNumber, setCopiedInvoiceNumber,

    updatingStatusId, setUpdatingStatusId,
    generatingPDFId, setGeneratingPDFId,
    sendingEmailId, setSendingEmailId,
    refreshingEmailId, setRefreshingEmailId,
    isSuggesting, setIsSuggesting,
    suggestingAIQuickId, setSuggestingAIQuickId,
    sendingSMSId, setSendingSMSId,
    changingRouteId, setChangingRouteId,
    reassigningInvoice, setReassigningInvoice,
    isReassigning, setIsReassigning,
    reassigningManifestInvoice, setReassigningManifestInvoice,
    isReassigningManifest, setIsReassigningManifest,
    reassignResendPrompt, setReassignResendPrompt
  };
};
