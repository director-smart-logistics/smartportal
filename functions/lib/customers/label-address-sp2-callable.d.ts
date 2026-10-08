interface Request {
    slCode?: string;
    deliveryAddress?: string;
}
export declare const slUpdateSp2AddressFromLabel: import("firebase-functions/v2/https").CallableFunction<Request, Promise<{
    success: boolean;
    changed: boolean;
    address: {
        [x: string]: any;
    } | undefined;
}>, unknown>;
export {};
//# sourceMappingURL=label-address-sp2-callable.d.ts.map