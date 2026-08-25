interface ListSettingsRequest {
    category?: string;
    isPublic?: boolean;
}
interface SettingRequest {
    key: string;
    value?: string;
    type?: string;
    category?: string;
    description?: string;
    isPublic?: boolean;
    countryCode?: string;
}
/**
 * List all settings
 */
export declare const slListSettings: import("firebase-functions/v2/https").CallableFunction<ListSettingsRequest, Promise<{
    success: boolean;
    data: {
        id: string;
    }[];
}>, unknown>;
/**
 * Get setting by key
 */
export declare const slGetSetting: import("firebase-functions/v2/https").CallableFunction<{
    key: string;
}, Promise<{
    success: boolean;
    data: {
        id: string;
    };
}>, unknown>;
/**
 * Create new setting
 */
export declare const slCreateSetting: import("firebase-functions/v2/https").CallableFunction<SettingRequest, Promise<{
    success: boolean;
    data: {
        id: string;
    };
}>, unknown>;
/**
 * Update setting by key
 */
export declare const slUpdateSetting: import("firebase-functions/v2/https").CallableFunction<SettingRequest, Promise<{
    success: boolean;
    data: {
        id: string;
    };
}>, unknown>;
/**
 * Delete setting by key (admin only)
 */
export declare const slDeleteSetting: import("firebase-functions/v2/https").CallableFunction<{
    key: string;
}, Promise<{
    success: boolean;
    message: string;
}>, unknown>;
/**
 * Get multiple settings by keys
 */
export declare const slBulkGetSettings: import("firebase-functions/v2/https").CallableFunction<{
    keys: string[];
}, Promise<{
    success: boolean;
    data: Record<string, string>;
}>, unknown>;
export {};
//# sourceMappingURL=index.d.ts.map