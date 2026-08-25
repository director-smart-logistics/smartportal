/**
 * Temporary Cloud Function to create Super Admin
 * Call from Firebase Console > Functions > slCreateSuperAdmin
 */
import * as functions from "firebase-functions";
export declare const slCreateSuperAdmin: functions.https.CallableFunction<any, Promise<{
    success: boolean;
    message: string;
    uid: string;
    email: string;
}>, unknown>;
//# sourceMappingURL=setup-super-admin.d.ts.map