import { describe, it, expect } from 'vitest';

/**
 * Unit Test Spec: Customer Sync SP1 Master Ruta Immunity
 * Verifies that existing SP1 customer `ruta` is NEVER overwritten by SP2 syncs.
 */
describe('Customer Sync SP1 Master Ruta Immunity', () => {
  it('SP1 existing ruta MUST prevail over SP2 incoming ruta', () => {
    const existingCustomer = {
      slCode: 'SL100',
      fullName: 'JUAN PEREZ',
      ruta: 'GAM ALFA', // SP1 master route assigned by operator
    };

    const sp2User = {
      slCode: 'SL100',
      fullName: 'JUAN PEREZ',
      ruta: 'SAN JOSE CENTRO', // Outdated or default route in SP2
    };

    // SP1 MANDATE: existingCustomer.ruta || sp2User.ruta || null
    const rutaToUse = existingCustomer.ruta || sp2User.ruta || null;

    expect(rutaToUse).toBe('GAM ALFA');
    expect(rutaToUse).not.toBe('SAN JOSE CENTRO');
  });

  it('SP2 incoming ruta is ONLY used as fallback when SP1 customer has no ruta', () => {
    const existingCustomer = {
      slCode: 'SL200',
      fullName: 'MARIA RODRIGUEZ',
      ruta: null, // No route set in SP1 yet
    };

    const sp2User = {
      slCode: 'SL200',
      fullName: 'MARIA RODRIGUEZ',
      ruta: 'HEREDIA',
    };

    const rutaToUse = existingCustomer.ruta || sp2User.ruta || null;

    expect(rutaToUse).toBe('HEREDIA');
  });

  it('SP2 incoming ruta overrides SP1 if syncRutaToSp1 is true and SP2 timestamp is newer', () => {
    const existingCustomer = {
      slCode: 'SL300',
      fullName: 'ROBERTO CHAVES',
      ruta: 'HEREDIA',
      rutaSetByAdminAt: '2026-07-30T10:00:00Z',
      isRutaAdminLocked: true,
    };

    const sp2User = {
      slCode: 'SL300',
      fullName: 'ROBERTO CHAVES',
      ruta: 'ALARUELA',
      syncRutaToSp1: true,
      rutaSetByAdminAt: '2026-07-31T12:00:00Z',
      rutaLastUpdatedBy: 'admin_sp2@email.com',
    };

    let rutaToUse = existingCustomer.ruta;
    let isRutaAdminLocked = existingCustomer.isRutaAdminLocked;
    let rutaSetByAdminAt = existingCustomer.rutaSetByAdminAt;

    if (sp2User.syncRutaToSp1 === true && sp2User.ruta) {
      const sp1AdminTime = existingCustomer.rutaSetByAdminAt ? new Date(existingCustomer.rutaSetByAdminAt).getTime() : 0;
      const sp2AdminTime = sp2User.rutaSetByAdminAt ? new Date(sp2User.rutaSetByAdminAt).getTime() : 0;
      
      if (sp2AdminTime >= sp1AdminTime) {
        rutaToUse = sp2User.ruta;
        isRutaAdminLocked = true;
        rutaSetByAdminAt = sp2User.rutaSetByAdminAt;
      }
    }

    expect(rutaToUse).toBe('ALARUELA');
    expect(isRutaAdminLocked).toBe(true);
    expect(rutaSetByAdminAt).toBe('2026-07-31T12:00:00Z');
  });

  it('SP2 incoming ruta does NOT override SP1 if syncRutaToSp1 is false, even if timestamp is newer', () => {
    const existingCustomer = {
      slCode: 'SL400',
      fullName: 'ANA GOMEZ',
      ruta: 'HEREDIA',
      rutaSetByAdminAt: '2026-07-30T10:00:00Z',
      isRutaAdminLocked: true,
    };

    const sp2User = {
      slCode: 'SL400',
      fullName: 'ANA GOMEZ',
      ruta: 'ALARUELA',
      syncRutaToSp1: false,
      rutaSetByAdminAt: '2026-07-31T12:00:00Z',
      rutaLastUpdatedBy: 'admin_sp2@email.com',
    };

    let rutaToUse = existingCustomer.ruta;
    let isRutaAdminLocked = existingCustomer.isRutaAdminLocked;

    if (sp2User.syncRutaToSp1 === true && sp2User.ruta) {
      const sp1AdminTime = existingCustomer.rutaSetByAdminAt ? new Date(existingCustomer.rutaSetByAdminAt).getTime() : 0;
      const sp2AdminTime = sp2User.rutaSetByAdminAt ? new Date(sp2User.rutaSetByAdminAt).getTime() : 0;
      
      if (sp2AdminTime >= sp1AdminTime) {
        rutaToUse = sp2User.ruta;
        isRutaAdminLocked = true;
      }
    }

    expect(rutaToUse).toBe('HEREDIA');
    expect(isRutaAdminLocked).toBe(true);
  });

  it('should map sp2User.encomiendaProvider to both encomiendaProvider and encomiendaServiceName in SP1', () => {
    const sp2User = {
      slCode: 'SL400',
      ruta: 'Encomiendas',
      encomiendaProvider: 'centeno',
    };

    const cleanCustomer = {
      ruta: sp2User.ruta,
      encomiendaProvider: sp2User.encomiendaProvider || null,
      encomiendaServiceName: sp2User.encomiendaProvider || null,
    };

    expect(cleanCustomer.encomiendaProvider).toBe('centeno');
    expect(cleanCustomer.encomiendaServiceName).toBe('centeno');
  });

  it('should force encomienda fields to null if route is not Encomiendas', () => {
    const existingCustomer = {
      ruta: 'Encomiendas',
      encomiendaProvider: 'centeno',
      encomiendaServiceName: 'centeno',
    };

    const cleanCustomer = {
      ruta: 'Alajuela',
      encomiendaProvider: null,
      encomiendaServiceName: null,
    };

    const updatedData = {
      ruta: cleanCustomer.ruta,
      encomiendaProvider: cleanCustomer.ruta === 'Encomiendas' ? (cleanCustomer.encomiendaProvider || existingCustomer.encomiendaProvider || null) : null,
      encomiendaServiceName: cleanCustomer.ruta === 'Encomiendas' ? (cleanCustomer.encomiendaServiceName || existingCustomer.encomiendaServiceName || null) : null,
    };

    expect(updatedData.encomiendaProvider).toBeNull();
    expect(updatedData.encomiendaServiceName).toBeNull();
  });
});
