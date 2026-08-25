import { useState, useEffect } from "react";
import { getActiveEncomiendas } from "./encomienda-service";

let lookupMap = new Map<string, string>();
let isLoading = false;
let isLoaded = false;
const listeners = new Set<() => void>();

export function registerEncomiendaForTest(id: string, name: string): void {
  lookupMap.set(id.toLowerCase(), name);
}

export function isLookupLoaded(): boolean {
  return isLoaded;
}

export async function initializeEncomiendaLookup(): Promise<Map<string, string>> {
  if (isLoaded) return lookupMap;
  if (isLoading) {
    return new Promise((resolve) => {
      const listener = () => {
        listeners.delete(listener);
        resolve(lookupMap);
      };
      listeners.add(listener);
    });
  }

  isLoading = true;
  const newMap = new Map<string, string>();

  try {
    // 1. Fetch from Firestore active encomiendas
    const list = await getActiveEncomiendas();
    list.forEach((e) => {
      newMap.set(e.id.toLowerCase(), e.name);
    });
  } catch (err) {
    console.warn("[encomienda-lookup] Failed to load active encomiendas from Firestore:", err);
  }

  try {
    // 2. Fetch from static JSON configuration
    const res = await fetch("/data/encomiendas.json");
    const data = await res.json();
    if (Array.isArray(data?.encomiendas)) {
      data.encomiendas.forEach((e: any) => {
        newMap.set(e.id.toLowerCase(), e.name);
      });
    }
  } catch (err) {
    console.warn("[encomienda-lookup] Failed to load static JSON encomiendas:", err);
  }

  lookupMap = newMap;
  isLoaded = true;
  isLoading = false;

  listeners.forEach((l) => l());
  listeners.clear();

  return lookupMap;
}

export function resolveEncomiendaName(idOrName: string | null | undefined): string {
  if (!idOrName) return "";
  const clean = idOrName.trim();
  const lower = clean.toLowerCase();
  return lookupMap.get(lower) || clean;
}

export function useEncomiendaLookup() {
  const [map, setMap] = useState<Map<string, string>>(lookupMap);
  const [ready, setReady] = useState(isLoaded);

  useEffect(() => {
    if (isLoaded) {
      setMap(lookupMap);
      setReady(true);
      return;
    }

    let active = true;
    initializeEncomiendaLookup().then((resolvedMap) => {
      if (active) {
        setMap(resolvedMap);
        setReady(true);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  return {
    ready,
    lookupMap: map,
    resolve: (idOrName: string | null | undefined): string => {
      if (!idOrName) return "";
      const clean = idOrName.trim();
      return map.get(clean.toLowerCase()) || clean;
    }
  };
}

export function resolveCustomerEncomiendaService(c: any, hint?: string): string {
  if (!c) return resolveEncomiendaName(hint);

  const getStr = (val: any): string => 
    (typeof val === 'string' && val.trim() ? val.trim() : '');

  const getFromEncObj = (enc: any): string => {
    if (!enc) return '';
    if (typeof enc === 'string') return getStr(enc);
    if (typeof enc === 'object') {
      return getStr(enc.name) || getStr(enc.id) || getStr(enc.nombre) || '';
    }
    return '';
  };

  // 1. Prioridad: Dirección por defecto
  let service = getFromEncObj(c.defaultAddress?.encomienda);
  if (service) return resolveEncomiendaName(service);

  // 2. Prioridad: Direcciones secundarias
  if (Array.isArray(c.addresses)) {
    const match = c.addresses.find((a: any) => getFromEncObj(a?.encomienda));
    if (match) {
      service = getFromEncObj(match.encomienda);
      if (service) return resolveEncomiendaName(service);
    }
  }

  // 3. Prioridad: Propiedades de nivel superior (evita fallar con objetos vacíos {})
  service = getStr(c.encomiendaServiceName) ||
            getStr(c.encomiendaProvider) ||
            getFromEncObj(c.encomienda) ||
            getStr(c.encomiendaName) ||
            getStr(c.encomiendaId);

  if (service) return resolveEncomiendaName(service);

  // 4. Prioridad: Hint/Respaldo del manifiesto
  return resolveEncomiendaName(hint);
}

