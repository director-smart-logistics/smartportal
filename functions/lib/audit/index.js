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
exports.slGetAuditSummary = exports.slGetAuditMetrics = exports.slGetAuditLogs = void 0;
__exportStar(require("./audit-types"), exports);
__exportStar(require("./audit-service"), exports);
var audit_callable_1 = require("./audit-callable");
Object.defineProperty(exports, "slGetAuditLogs", { enumerable: true, get: function () { return audit_callable_1.slGetAuditLogs; } });
Object.defineProperty(exports, "slGetAuditMetrics", { enumerable: true, get: function () { return audit_callable_1.slGetAuditMetrics; } });
Object.defineProperty(exports, "slGetAuditSummary", { enumerable: true, get: function () { return audit_callable_1.slGetAuditSummary; } });
//# sourceMappingURL=index.js.map