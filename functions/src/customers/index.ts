export {
  slListCustomers,
  slGetCustomer,
  slGetCustomerBySlCode,
  slCreateCustomer,
  slUpdateCustomer,
  slDeleteCustomer,
} from "./callable";

// Customer sync functions (SP2 -> SP1) + admin profile update + real-time push receiver
export {
  triggerCustomerSync,
  slUpdateCustomerProfile,
  slSyncCustomerFromSp2,
  slForceSyncCustomerFromSP2,
} from "./sync";

// Reverse lookup endpoint (SP2 -> SP1) used by SP2's email diagnostic modal to
// recover orphan Auth users by rehydrating the SP2 profile from SP1.
export { slLookupCustomerByEmail } from "./lookup-by-email";

// Admin-only manual recreate when a customer was deleted from both SP1 and SP2
// but orphan data (paquetes/facturas/pre-alertas) is still attached to the slCode.
export { slRecreateCustomerBySlCode, slRecreateSp2UserAccount } from "./recreate";

// Firestore trigger — canonical SP1 → SP2 propagation point.
export { onCustomerWritten } from "./triggers";
