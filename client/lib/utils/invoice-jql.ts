const INVOICE_JQL_FIELDS_MAP: Record<string, string> = {
  "invoice": "invoiceNumber",
  "id": "invoiceNumber",
  "number": "invoiceNumber",
  "factura": "invoiceNumber",
  "status": "status",
  "s": "status",
  "estado": "status",
  "route": "route",
  "r": "route",
  "ruta": "route",
  "customer": "clientName",
  "client": "clientName",
  "c": "clientName",
  "cliente": "clientName",
  "name": "clientName",
  "code": "clientSlCode",
  "slcode": "clientSlCode",
  "smartid": "clientSlCode",
  "manifest": "manifestNumber",
  "m": "manifestNumber",
  "manifiesto": "manifestNumber",
  "total": "totalAmount",
  "amount": "totalAmount",
  "t": "totalAmount",
  "totalamount": "totalAmount",
  "currency": "currency",
  "moneda": "currency",
  "exchangerate": "exchangeRate",
  "tc": "exchangeRate",
  "tipocambio": "exchangeRate",
  "weight": "totalWeight",
  "w": "totalWeight",
  "peso": "totalWeight",
  "dni": "clientDni",
  "cedula": "clientDni",
  "email": "clientEmail",
  "correo": "clientEmail",
  "phone": "clientPhone",
  "telefono": "clientPhone",
  "tracking": "trackingNumber",
  "t_number": "trackingNumber",
};

const resolveInvoiceStatus = (val: string): string => {
  const map: Record<string, string> = {
    "draft": "draft",
    "borrador": "draft",
    "sent": "sent",
    "procesada": "sent",
    "procesado": "sent",
    "paid": "paid",
    "pagada": "paid",
    "pagado": "paid",
    "ruta": "paid",
    "en_ruta": "paid",
    "en-ruta": "paid",
    "annulled": "annulled",
    "anulada": "annulled",
    "anulado": "annulled",
  };
  return map[val] || val;
};

export function parseInvoiceJQL(queryStr: string): ((invoice: any) => boolean) | null {
  const trimmed = queryStr.trim();
  if (!trimmed) return null;

  const hasOperator = /[=><~]/.test(trimmed);
  if (!hasOperator) return null; // Fallback to standard search

  let isOr = false;
  let parts = trimmed.split(/\s+AND\s+/i);
  if (parts.length === 1) {
    const orParts = trimmed.split(/\s+OR\s+/i);
    if (orParts.length > 1) {
      parts = orParts;
      isOr = true;
    }
  }

  const rules: ((invoice: any) => boolean)[] = [];

  for (const part of parts) {
    const match = part.match(/^\s*(\w+)\s*(!=|>=|<=|=|>|<|~|!~)\s*(["']?.*?["']?)\s*$/);
    if (!match) continue;

    const [, rawField, op, rawValue] = match;
    const field = rawField.toLowerCase().trim();
    const value = rawValue.replace(/^["']|["']$/g, "").trim().toLowerCase();

    const mappedField = INVOICE_JQL_FIELDS_MAP[field];
    if (!mappedField) continue;

    rules.push((invoice: any) => {
      let val: any;
      if (mappedField === "clientName") {
        val = invoice.clientName || invoice.customer?.fullName || invoice.customerName || "";
      } else if (mappedField === "clientSlCode") {
        val = invoice.clientSlCode || invoice.slCode || invoice.customer?.slCode || "";
      } else if (mappedField === "route") {
        val = invoice.route?.name || invoice.route || invoice.customer?.ruta || "";
      } else if (mappedField === "clientDni") {
        val = invoice.clientDni || invoice.customer?.dni || "";
      } else if (mappedField === "clientEmail") {
        val = invoice.clientEmail || invoice.customer?.email || "";
      } else if (mappedField === "clientPhone") {
        val = invoice.clientPhone || invoice.customer?.phone || "";
      } else if (mappedField === "trackingNumber") {
        // Evaluate all trackings in invoice items/trackingNumbers
        const items = invoice.invoiceItems || invoice.items || [];
        const trackings = [
          invoice.trackingNumber || "",
          ...(invoice.trackingNumbers || []),
          ...items.map((i: any) => i.trackingNumber || i.tracking || "")
        ].filter(Boolean);
        const matchVal = value;
        const isSuffixMatch = (matchVal.length === 4 || matchVal.length === 6 || matchVal.length === 8);
        
        return trackings.some(t => {
          const tStr = String(t).toLowerCase().trim();
          const tNorm = tStr.replace(/[-\s]/g, "");
          const matchNorm = matchVal.replace(/[-\s]/g, "");
          if (op === "=") {
            return tStr === matchVal || tNorm === matchNorm || (isSuffixMatch && (tStr.endsWith(matchVal) || tNorm.endsWith(matchNorm)));
          } else if (op === "!=") {
            return tStr !== matchVal && tNorm !== matchNorm && (!isSuffixMatch || (!tStr.endsWith(matchVal) && !tNorm.endsWith(matchNorm)));
          } else if (op === "~") {
            return tStr.includes(matchVal) || tNorm.includes(matchNorm);
          } else if (op === "!~") {
            return !tStr.includes(matchVal) && !tNorm.includes(matchNorm);
          }
          return false;
        });
      } else {
        val = invoice[mappedField];
      }

      let valStr = String(val ?? "").toLowerCase().trim();
      let matchVal = value;

      if (mappedField === "status") {
        valStr = resolveInvoiceStatus(valStr);
        matchVal = resolveInvoiceStatus(matchVal);
      }

      const isNormalizedField = (
        mappedField === "invoiceNumber" ||
        mappedField === "clientSlCode" ||
        mappedField === "clientDni" ||
        mappedField === "clientPhone"
      );

      const valNorm = isNormalizedField ? valStr.replace(/[-\s]/g, "") : valStr;
      const matchNorm = isNormalizedField ? matchVal.replace(/[-\s]/g, "") : matchVal;

      const isSuffixMatch = (matchVal.length === 4 || matchVal.length === 6 || matchVal.length === 8) &&
                            (mappedField === "invoiceNumber" || mappedField === "clientSlCode" || mappedField === "manifestNumber" || mappedField === "clientDni" || mappedField === "clientPhone");

      switch (op) {
        case "=":
          if (valStr === matchVal || (isNormalizedField && valNorm === matchNorm)) {
            return true;
          }
          if (isSuffixMatch) {
            return valStr.endsWith(matchVal) || valNorm.endsWith(matchNorm);
          }
          return false;
        case "!=":
          if (isSuffixMatch) {
            return valStr !== matchVal && !valStr.endsWith(matchVal) && (!isNormalizedField || (!valNorm.endsWith(matchNorm) && valNorm !== matchNorm));
          }
          return valStr !== matchVal && (!isNormalizedField || valNorm !== matchNorm);
        case "~":
          return valStr.includes(matchVal) || (isNormalizedField && valNorm.includes(matchNorm));
        case "!~":
          return !valStr.includes(matchVal) && (!isNormalizedField || !valNorm.includes(matchNorm));
        case ">":
          return Number(val || 0) > Number(matchVal || 0);
        case "<":
          return Number(val || 0) < Number(matchVal || 0);
        case ">=":
          return Number(val || 0) >= Number(matchVal || 0);
        case "<=":
          return Number(val || 0) <= Number(matchVal || 0);
        default:
          return false;
      }
    });
  }

  if (rules.length === 0) return null;

  return (invoice: any) => {
    if (isOr) {
      return rules.some((rule) => rule(invoice));
    } else {
      return rules.every((rule) => rule(invoice));
    }
  };
}

export function validateInvoiceJQLSyntax(queryStr: string): string {
  const trimmed = queryStr.trim();
  if (!trimmed) return "";
  const hasOperator = /[=><~]/.test(trimmed);
  if (!hasOperator) return ""; // Regular search fallback

  let parts = trimmed.split(/\s+AND\s+/i);
  if (parts.length === 1) {
    const orParts = trimmed.split(/\s+OR\s+/i);
    if (orParts.length > 1) {
      parts = orParts;
    }
  }

  for (const part of parts) {
    const match = part.match(/^\s*(\w+)\s*(!=|>=|<=|=|>|<|~|!~)\s*(["']?.*?["']?)\s*$/);
    if (!match) {
      return `Error en JQL: "${part}". Se espera formato: campo = valor.`;
    }
    const [, field] = match;
    if (!INVOICE_JQL_FIELDS_MAP[field.toLowerCase().trim()]) {
      return `Campo no válido: "${field}".`;
    }
  }
  return "";
}
