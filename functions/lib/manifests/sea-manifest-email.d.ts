export interface SeaManifestInvoiceEmailData {
    customerName: string;
    customerEmail: string;
    customerDni: string;
    customerAddress: string;
    invoiceNumber: string;
    invoiceDate: string;
    tracking: string;
    length: string;
    width: string;
    height: string;
    volume: number;
    basePrice: number;
    bodegajeCost: number;
    permisoCost: number;
    subtotal: number;
    tax: number;
    total: number;
    exchangeRate: number;
    totalCRC: number;
    ivaEnabled: boolean;
}
export declare const slSendSeaManifestInvoiceEmail: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    messageId: string | undefined;
}>, unknown>;
//# sourceMappingURL=sea-manifest-email.d.ts.map