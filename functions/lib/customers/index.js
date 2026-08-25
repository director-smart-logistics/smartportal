"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onCustomerWritten = exports.slRecreateSp2UserAccount = exports.slRecreateCustomerBySlCode = exports.slLookupCustomerByEmail = exports.slForceSyncCustomerFromSP2 = exports.slSyncCustomerFromSp2 = exports.slUpdateCustomerProfile = exports.triggerCustomerSync = exports.slDeleteCustomer = exports.slUpdateCustomer = exports.slCreateCustomer = exports.slGetCustomerBySlCode = exports.slGetCustomer = exports.slListCustomers = void 0;
var callable_1 = require("./callable");
Object.defineProperty(exports, "slListCustomers", { enumerable: true, get: function () { return callable_1.slListCustomers; } });
Object.defineProperty(exports, "slGetCustomer", { enumerable: true, get: function () { return callable_1.slGetCustomer; } });
Object.defineProperty(exports, "slGetCustomerBySlCode", { enumerable: true, get: function () { return callable_1.slGetCustomerBySlCode; } });
Object.defineProperty(exports, "slCreateCustomer", { enumerable: true, get: function () { return callable_1.slCreateCustomer; } });
Object.defineProperty(exports, "slUpdateCustomer", { enumerable: true, get: function () { return callable_1.slUpdateCustomer; } });
Object.defineProperty(exports, "slDeleteCustomer", { enumerable: true, get: function () { return callable_1.slDeleteCustomer; } });
// Customer sync functions (SP2 -> SP1) + admin profile update + real-time push receiver
var sync_1 = require("./sync");
Object.defineProperty(exports, "triggerCustomerSync", { enumerable: true, get: function () { return sync_1.triggerCustomerSync; } });
Object.defineProperty(exports, "slUpdateCustomerProfile", { enumerable: true, get: function () { return sync_1.slUpdateCustomerProfile; } });
Object.defineProperty(exports, "slSyncCustomerFromSp2", { enumerable: true, get: function () { return sync_1.slSyncCustomerFromSp2; } });
Object.defineProperty(exports, "slForceSyncCustomerFromSP2", { enumerable: true, get: function () { return sync_1.slForceSyncCustomerFromSP2; } });
// Reverse lookup endpoint (SP2 -> SP1) used by SP2's email diagnostic modal to
// recover orphan Auth users by rehydrating the SP2 profile from SP1.
var lookup_by_email_1 = require("./lookup-by-email");
Object.defineProperty(exports, "slLookupCustomerByEmail", { enumerable: true, get: function () { return lookup_by_email_1.slLookupCustomerByEmail; } });
// Admin-only manual recreate when a customer was deleted from both SP1 and SP2
// but orphan data (paquetes/facturas/pre-alertas) is still attached to the slCode.
var recreate_1 = require("./recreate");
Object.defineProperty(exports, "slRecreateCustomerBySlCode", { enumerable: true, get: function () { return recreate_1.slRecreateCustomerBySlCode; } });
Object.defineProperty(exports, "slRecreateSp2UserAccount", { enumerable: true, get: function () { return recreate_1.slRecreateSp2UserAccount; } });
// Firestore trigger — canonical SP1 → SP2 propagation point.
var triggers_1 = require("./triggers");
Object.defineProperty(exports, "onCustomerWritten", { enumerable: true, get: function () { return triggers_1.onCustomerWritten; } });
//# sourceMappingURL=index.js.map