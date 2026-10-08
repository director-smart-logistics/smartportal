import { type RouteReview } from "./route-review";
interface Request {
    slCode?: string;
    ruta?: string;
    action?: "decide" | "confirm";
}
type Db = FirebaseFirestore.Firestore;
/** Where the customer's route stands in every place that uses it. `ok` = all the same and nothing left behind. */
export declare function routeIntegrityCore(db: Db, sp2: Db, slCode: string, candidateRuta?: string | null): Promise<{
    candidateRuta?: string | null | undefined;
    packagesForCandidate?: import("./route-review").OpenPackageOnRoute[] | undefined;
    packages: import("./route-review").OpenPackageOnRoute[];
    sp1: any;
    sp2: any;
    sp2Matches: boolean;
    learningEntriesOnOtherRoute: number;
    openPackagesOnOtherRoute: number;
    reviewPending: boolean;
    ok: boolean;
}>;
export declare function resolveRouteReviewCore(db: Db, input: Request, by: string, now?: string): Promise<{
    review: RouteReview;
    rutaChanged: boolean;
    uid: string | null;
}>;
export declare const slResolveRouteReview: import("firebase-functions/v2/https").CallableFunction<Request, Promise<{
    success: boolean;
    review: RouteReview;
    rutaChanged: boolean;
    sp2Updated: boolean;
    sp2Error: string | null;
}>, unknown>;
/**
 * slMovePackagesToCustomerRoute — Nova: move the selected packages still in process to the customer's current
 * route (after a route decision). One transaction: each package (only if it is this customer's and still open),
 * the customer's packagesOnPreviousRoute list and the route_reviews log. The package trigger keeps the encomienda
 * manifest in step (a package leaving "Encomiendas" leaves manifest_encomiendas).
 */
export declare function movePackagesCore(db: Db, input: {
    slCode?: string;
    packageIds?: string[];
}, by: string, now?: string): Promise<{
    ruta: string;
    moved: {
        id: string;
        from: string | null;
    }[];
    skipped: {
        id: string;
        why: string;
    }[];
}>;
export declare const slMovePackagesToCustomerRoute: import("firebase-functions/v2/https").CallableFunction<{
    slCode?: string;
    packageIds?: string[];
}, Promise<{
    ruta: string;
    moved: {
        id: string;
        from: string | null;
    }[];
    skipped: {
        id: string;
        why: string;
    }[];
    success: boolean;
}>, unknown>;
export declare const slCheckRouteIntegrity: import("firebase-functions/v2/https").CallableFunction<{
    slCode?: string;
    ruta?: string;
}, Promise<{
    candidateRuta?: string | null | undefined;
    packagesForCandidate?: import("./route-review").OpenPackageOnRoute[] | undefined;
    packages: import("./route-review").OpenPackageOnRoute[];
    sp1: any;
    sp2: any;
    sp2Matches: boolean;
    learningEntriesOnOtherRoute: number;
    openPackagesOnOtherRoute: number;
    reviewPending: boolean;
    ok: boolean;
}>, unknown>;
export {};
//# sourceMappingURL=route-review-callable.d.ts.map