export declare const slTrackColombia: import("firebase-functions/v2/https").CallableFunction<{
    trackingNumber: string;
}, Promise<{
    found: boolean;
    error: string;
    trackingNumber?: undefined;
    originalTracking?: undefined;
    providerId?: undefined;
    providerName?: undefined;
    statusCode?: undefined;
    statusMessage?: undefined;
    manifestId?: undefined;
    lastUpdate?: undefined;
    events?: undefined;
    mensaje?: undefined;
} | {
    found: boolean;
    error?: undefined;
    trackingNumber?: undefined;
    originalTracking?: undefined;
    providerId?: undefined;
    providerName?: undefined;
    statusCode?: undefined;
    statusMessage?: undefined;
    manifestId?: undefined;
    lastUpdate?: undefined;
    events?: undefined;
    mensaje?: undefined;
} | {
    found: boolean;
    trackingNumber: any;
    originalTracking: string;
    providerId: string;
    providerName: string;
    statusCode: string;
    statusMessage: any;
    manifestId: any;
    lastUpdate: any;
    events: {
        timestamp: string;
        description: string;
        statusCode: string;
    }[];
    mensaje: any;
    error?: undefined;
}>, unknown>;
//# sourceMappingURL=callable.d.ts.map