interface RecreateRequest {
    slCode: string;
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
    dni?: string;
    ruta?: string;
    nationality?: string;
    birthDate?: string;
    country?: string;
    /** Optional audit note (e.g. "Cliente eliminado por inactividad — paquetes huérfanos") */
    reason?: string;
    /** If true, overwrites an existing customer record if it already exists. */
    force?: boolean;
}
export declare const slRecreateCustomerBySlCode: import("firebase-functions/v2/https").CallableFunction<RecreateRequest, Promise<{
    success: true;
    customer: {
        id: string;
        slCode: string;
        email: string;
        fullName: string;
    };
}>, unknown>;
export declare const slRecreateSp2UserAccount: import("firebase-functions/v2/https").CallableFunction<{
    slCode: string;
}, Promise<{
    success: boolean;
    message?: string;
}>, unknown>;
export {};
//# sourceMappingURL=recreate.d.ts.map