export {
  slListInvoices,
  slGetInvoice,
  slCreateInvoice,
  slUpdateInvoice,
  slMarkInvoicePaid,
  slDeleteInvoice,
  slVerifyInvoicesSync,
} from "./callable";

// Firestore trigger — canonical SP1 → SP2 propagation point.
// See ./triggers.ts for design notes.
export { onInvoiceWritten } from "./triggers";
