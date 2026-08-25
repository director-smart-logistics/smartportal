import { useState } from 'react';
import { Invoice, InvoiceStatus } from '../types';

export const useInvoiceEditState = () => {
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [editDiscountPercentage, setEditDiscountPercentage] = useState<number>(0);
  const [editNotes, setEditNotes] = useState<string>("");
  const [editInternalNotes, setEditInternalNotes] = useState<string>("");
  const [editPackages, setEditPackages] = useState<string[]>([]);
  const [editCurrency, setEditCurrency] = useState<string>("USD");
  const [editDueDate, setEditDueDate] = useState<string>("");
  const [editClientName, setEditClientName] = useState<string>("");
  const [editClientEmail, setEditClientEmail] = useState<string>("");
  const [editClientPhone, setEditClientPhone] = useState<string>("");
  const [editClientDni, setEditClientDni] = useState<string>("");
  const [editManifestNumber, setEditManifestNumber] = useState<string>("");
  const [editStatus, setEditStatus] = useState<InvoiceStatus>("draft");
  const [editPaymentMethod, setEditPaymentMethod] = useState<string>("");
  const [editPaymentReference, setEditPaymentReference] = useState<string>("");
  const [editExchangeRate, setEditExchangeRate] = useState<number>(0);
  const [editOriginalExchangeRate, setEditOriginalExchangeRate] = useState<number>(0);
  const [editTcAlsoPackages, setEditTcAlsoPackages] = useState<boolean>(true);
  const [editItems, setEditItems] = useState<Array<{
    trackingNumber: string;
    description: string;
    weight: number;
    unitPrice: number;
    quantity: number;
    packageId?: string;
    isManual?: boolean;
    currency?: 'USD' | 'CRC';
    requiresPermit?: boolean;
  }>>([]);

  const [moveItemPopover, setMoveItemPopover] = useState<{ itemIdx: number } | null>(null);
  const [movingItemIdx, setMovingItemIdx] = useState<number | null>(null);

  return {
    editingInvoice, setEditingInvoice,
    editDiscountPercentage, setEditDiscountPercentage,
    editNotes, setEditNotes,
    editInternalNotes, setEditInternalNotes,
    editPackages, setEditPackages,
    editCurrency, setEditCurrency,
    editDueDate, setEditDueDate,
    editClientName, setEditClientName,
    editClientEmail, setEditClientEmail,
    editClientPhone, setEditClientPhone,
    editClientDni, setEditClientDni,
    editManifestNumber, setEditManifestNumber,
    editStatus, setEditStatus,
    editPaymentMethod, setEditPaymentMethod,
    editPaymentReference, setEditPaymentReference,
    editExchangeRate, setEditExchangeRate,
    editOriginalExchangeRate, setEditOriginalExchangeRate,
    editTcAlsoPackages, setEditTcAlsoPackages,
    editItems, setEditItems,
    moveItemPopover, setMoveItemPopover,
    movingItemIdx, setMovingItemIdx,
  };
};
