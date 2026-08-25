import { admin } from "../config/firebase";
interface ListInvoicesRequest {
    page?: number;
    limit?: number;
    sortOrder?: "asc" | "desc";
    q?: string;
    status?: string;
}
interface InvoiceItem {
    packageId?: string;
    description?: string;
    quantity?: number;
    unitPrice?: number;
    /** Nova-format: amount is used when unitPrice is absent */
    amount?: number;
    subtotal?: number;
    weight?: number;
    [key: string]: unknown;
}
interface CreateInvoiceRequest {
    customerId: string;
    items: InvoiceItem[];
    taxRate?: number;
    discountPercentage?: number;
    currency?: string;
    dueDate?: string;
    notes?: string;
}
interface UpdateInvoiceRequest {
    invoiceId: string;
    status?: string;
    notes?: string;
    internalNotes?: string;
    paymentMethod?: string;
    paymentReference?: string;
    currency?: string;
    dueDate?: string;
    discountPercentage?: number;
    items?: InvoiceItem[];
    clientName?: string;
    clientEmail?: string;
    clientPhone?: string;
    clientDni?: string;
    manifestNumber?: string;
    origin?: string;
    destination?: string;
}
export declare const slListInvoices: import("firebase-functions/v2/https").CallableFunction<ListInvoicesRequest, Promise<{
    success: boolean;
    data: {
        id: string;
        invoiceNumber: any;
        customerId: any;
        status: any;
        totalAmount: any;
        subtotalAmount: any;
        taxAmount: any;
        currency: any;
        invoiceDate: any;
        dueDate: any;
        paidAt: any;
        pdfUrl: any;
        clientSlCode: any;
        clientEmail: any;
        createdAt: any;
    }[];
    pagination: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}>, unknown>;
export declare const slGetInvoice: import("firebase-functions/v2/https").CallableFunction<{
    invoiceId: string;
}, Promise<{
    success: boolean;
    data: {
        items: {
            createdAt: any;
            package?: Record<string, any> | undefined;
            id: string;
        }[];
        invoiceDate: any;
        dueDate: any;
        sentAt: any;
        paidAt: any;
        createdAt: any;
        updatedAt: any;
        id: string;
    };
}>, unknown>;
export declare const slCreateInvoice: import("firebase-functions/v2/https").CallableFunction<CreateInvoiceRequest, Promise<{
    success: boolean;
    data: {
        id: string;
        invoiceNumber: string;
        items: {
            id: string;
            packageId: string | null;
            description: string;
            quantity: number;
            unitPrice: number;
            totalPrice: number;
            weight: number | null;
        }[];
        invoiceDate: string;
        createdAt: string;
        updatedAt: string;
        customerId: string;
        status: string;
        totalAmount: number;
        subtotalAmount: number;
        taxAmount: number;
        taxRate: number;
        discountAmount: number;
        discountPercentage: number;
        currency: string;
        exchangeRate: null;
        dueDate: admin.firestore.Timestamp;
        sentAt: null;
        paidAt: null;
        notes: string | null;
        internalNotes: null;
        pdfUrl: null;
        pdfPath: null;
        clientSlCode: any;
        clientEmail: any;
        clientDni: any;
        clientPhone: any;
        paymentMethod: null;
        paymentReference: null;
        createdBy: string;
    };
}>, unknown>;
export declare const slUpdateInvoice: import("firebase-functions/v2/https").CallableFunction<UpdateInvoiceRequest, Promise<{
    success: boolean;
    id: string;
}>, unknown>;
export declare const slMarkInvoicePaid: import("firebase-functions/v2/https").CallableFunction<{
    invoiceId: string;
    paymentMethod?: string;
    paymentReference?: string;
}, Promise<{
    success: boolean;
    invoiceId: string;
    status: string;
}>, unknown>;
export declare const slDeleteInvoice: import("firebase-functions/v2/https").CallableFunction<{
    invoiceId: string;
}, Promise<{
    success: boolean;
    id: string;
}>, unknown>;
interface VerifyInvoicesSyncRequest {
    days?: number;
}
export declare const slVerifyInvoicesSync: import("firebase-functions/v2/https").CallableFunction<VerifyInvoicesSyncRequest, Promise<{
    success: boolean;
    data: {
        unsynced: {
            id: any;
            invoiceNumber: any;
            status: any;
            clientSlCode: any;
            clientName: any;
            createdAt: any;
            _syncError: any;
        }[];
        missingSlCode: {
            id: any;
            invoiceNumber: any;
            status: any;
            clientSlCode: any;
            clientName: any;
            createdAt: any;
            _syncError: any;
        }[];
    };
}>, unknown>;
export {};
//# sourceMappingURL=callable.d.ts.map