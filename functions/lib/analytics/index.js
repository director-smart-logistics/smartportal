"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.slInitializeDashboardCounters = exports.slGetMonthlyAnalytics = exports.slGetRecentActivity = exports.slGetInvoicesByStatus = exports.slGetPackagesByStatus = exports.slGetDashboardStats = void 0;
var callable_1 = require("./callable");
Object.defineProperty(exports, "slGetDashboardStats", { enumerable: true, get: function () { return callable_1.slGetDashboardStats; } });
Object.defineProperty(exports, "slGetPackagesByStatus", { enumerable: true, get: function () { return callable_1.slGetPackagesByStatus; } });
Object.defineProperty(exports, "slGetInvoicesByStatus", { enumerable: true, get: function () { return callable_1.slGetInvoicesByStatus; } });
Object.defineProperty(exports, "slGetRecentActivity", { enumerable: true, get: function () { return callable_1.slGetRecentActivity; } });
Object.defineProperty(exports, "slGetMonthlyAnalytics", { enumerable: true, get: function () { return callable_1.slGetMonthlyAnalytics; } });
Object.defineProperty(exports, "slInitializeDashboardCounters", { enumerable: true, get: function () { return callable_1.slInitializeDashboardCounters; } });
__exportStar(require("./triggers"), exports);
//# sourceMappingURL=index.js.map