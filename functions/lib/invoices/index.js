"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onInvoiceWritten = exports.slVerifyInvoicesSync = exports.slDeleteInvoice = exports.slMarkInvoicePaid = exports.slUpdateInvoice = exports.slCreateInvoice = exports.slGetInvoice = exports.slListInvoices = void 0;
var callable_1 = require("./callable");
Object.defineProperty(exports, "slListInvoices", { enumerable: true, get: function () { return callable_1.slListInvoices; } });
Object.defineProperty(exports, "slGetInvoice", { enumerable: true, get: function () { return callable_1.slGetInvoice; } });
Object.defineProperty(exports, "slCreateInvoice", { enumerable: true, get: function () { return callable_1.slCreateInvoice; } });
Object.defineProperty(exports, "slUpdateInvoice", { enumerable: true, get: function () { return callable_1.slUpdateInvoice; } });
Object.defineProperty(exports, "slMarkInvoicePaid", { enumerable: true, get: function () { return callable_1.slMarkInvoicePaid; } });
Object.defineProperty(exports, "slDeleteInvoice", { enumerable: true, get: function () { return callable_1.slDeleteInvoice; } });
Object.defineProperty(exports, "slVerifyInvoicesSync", { enumerable: true, get: function () { return callable_1.slVerifyInvoicesSync; } });
// Firestore trigger — canonical SP1 → SP2 propagation point.
// See ./triggers.ts for design notes.
var triggers_1 = require("./triggers");
Object.defineProperty(exports, "onInvoiceWritten", { enumerable: true, get: function () { return triggers_1.onInvoiceWritten; } });
//# sourceMappingURL=index.js.map