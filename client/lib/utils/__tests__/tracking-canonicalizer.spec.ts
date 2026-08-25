import { describe, it, expect } from 'vitest';
import { canonicalizeTracking, cleanRawTracking, MIAMI_WAREHOUSE_ZIPS } from '../tracking-canonicalizer';

describe('Tracking Canonicalizer & Carrier Classifier — Enterprise Test Suite', () => {
  describe('Category 1: Discrete Alphanumeric Protection (Zero Numeric Slicing)', () => {
    it('GFUS01065635648649 (SpeedLogistics) debe ser DISCRETE_ALPHANUMERIC y no permitir sufijos', () => {
      const result = canonicalizeTracking('GFUS01065635648649');
      expect(result.carrierType).toBe('DISCRETE_ALPHANUMERIC');
      expect(result.carrier).toBe('SPEEDLOGISTICS');
      expect(result.canonicalTracking).toBe('GFUS01065635648649');
      expect(result.allowSuffix).toBe(false);
      expect(result.trackingVariants).toEqual(['GFUS01065635648649']);
    });

    it('GSU8821992019 (SpeedLogistics GSU) debe ser DISCRETE_ALPHANUMERIC', () => {
      const result = canonicalizeTracking('GSU8821992019');
      expect(result.carrierType).toBe('DISCRETE_ALPHANUMERIC');
      expect(result.carrier).toBe('SPEEDLOGISTICS');
      expect(result.allowSuffix).toBe(false);
    });

    it('1Z8V76X80398480603 (UPS 1Z) debe ser DISCRETE_ALPHANUMERIC sin cortes', () => {
      const result = canonicalizeTracking('1Z8V76X80398480603');
      expect(result.carrierType).toBe('DISCRETE_ALPHANUMERIC');
      expect(result.carrier).toBe('UPS');
      expect(result.canonicalTracking).toBe('1Z8V76X80398480603');
      expect(result.allowSuffix).toBe(false);
      expect(result.trackingVariants).toEqual(['1Z8V76X80398480603']);
    });

    it('TBA333475078910 (Amazon Logistics) debe ser DISCRETE_ALPHANUMERIC', () => {
      const result = canonicalizeTracking('TBA333475078910');
      expect(result.carrierType).toBe('DISCRETE_ALPHANUMERIC');
      expect(result.carrier).toBe('AMAZON');
      expect(result.allowSuffix).toBe(false);
      expect(result.trackingVariants).toEqual(['TBA333475078910']);
    });

    it('YT2604812345678901 (YunExpress) debe ser DISCRETE_ALPHANUMERIC', () => {
      const result = canonicalizeTracking('YT2604812345678901');
      expect(result.carrierType).toBe('DISCRETE_ALPHANUMERIC');
      expect(result.carrier).toBe('YUNEXPRESS');
      expect(result.allowSuffix).toBe(false);
    });

    it('LP00561234567890 (Cainiao) debe ser DISCRETE_ALPHANUMERIC', () => {
      const result = canonicalizeTracking('LP00561234567890');
      expect(result.carrierType).toBe('DISCRETE_ALPHANUMERIC');
      expect(result.carrier).toBe('CAINIAO');
      expect(result.allowSuffix).toBe(false);
    });

    it('1LS1234567890123 (OnTrac / LaserShip) debe ser DISCRETE_ALPHANUMERIC', () => {
      const result = canonicalizeTracking('1LS1234567890123');
      expect(result.carrierType).toBe('DISCRETE_ALPHANUMERIC');
      expect(result.carrier).toBe('ONTRAC');
      expect(result.allowSuffix).toBe(false);
    });

    it('EA123456789US y LC987654321US (UPU S10 USPS International) deben ser DISCRETE_ALPHANUMERIC', () => {
      const result1 = canonicalizeTracking('EA123456789US');
      expect(result1.carrierType).toBe('DISCRETE_ALPHANUMERIC');
      expect(result1.carrier).toBe('USPS');
      expect(result1.allowSuffix).toBe(false);

      const result2 = canonicalizeTracking('LC987654321US');
      expect(result2.carrierType).toBe('DISCRETE_ALPHANUMERIC');
      expect(result2.carrier).toBe('USPS');
    });

    it('DHL 10 dígitos o JD prefijo debe ser DISCRETE_ALPHANUMERIC', () => {
      const result1 = canonicalizeTracking('1234567890');
      expect(result1.carrier).toBe('DHL');
      expect(result1.allowSuffix).toBe(false);

      const result2 = canonicalizeTracking('JD0123456789012345');
      expect(result2.carrier).toBe('DHL');
      expect(result2.allowSuffix).toBe(false);
    });
  });

  describe('Category 2: Postal Composite (USPS IMpb & FedEx GS1 Canonical Extraction)', () => {
    it('USPS Direct 22-digit IMpb (9400111899228226247158)', () => {
      const result = canonicalizeTracking('9400111899228226247158');
      expect(result.carrierType).toBe('POSTAL_COMPOSITE');
      expect(result.carrier).toBe('USPS');
      expect(result.canonicalTracking).toBe('9400111899228226247158');
      expect(result.allowSuffix).toBe(false);
      expect(result.trackingVariants).toContain('9400111899228226247158');
      expect(result.trackingVariants).toContain('420331669400111899228226247158');
      expect(result.trackingVariants).toContain('420331229400111899228226247158');
    });

    it('USPS Direct 20-digit IMpb (94001118992234965259)', () => {
      const result = canonicalizeTracking('94001118992234965259');
      expect(result.carrierType).toBe('POSTAL_COMPOSITE');
      expect(result.carrier).toBe('USPS');
      expect(result.canonicalTracking).toBe('94001118992234965259');
      expect(result.allowSuffix).toBe(false);
    });

    it('USPS 30-digit Barcode con prefijo 420 + ZIP 33166 (420331669400111899223344556677)', () => {
      const result = canonicalizeTracking('420331669400111899223344556677');
      expect(result.carrierType).toBe('POSTAL_COMPOSITE');
      expect(result.carrier).toBe('USPS');
      expect(result.canonicalTracking).toBe('9400111899223344556677');
      expect(result.allowSuffix).toBe(false);
      expect(result.trackingVariants).toContain('9400111899223344556677');
      expect(result.trackingVariants).toContain('420331669400111899223344556677');
      expect(result.trackingVariants).toContain('420331229400111899223344556677');
    });

    it('USPS 34-digit Barcode con prefijo 420 + ZIP+4 (4203316624199400111899223344556677)', () => {
      const result = canonicalizeTracking('4203316624199400111899223344556677');
      expect(result.carrierType).toBe('POSTAL_COMPOSITE');
      expect(result.carrier).toBe('USPS');
      expect(result.canonicalTracking).toBe('9400111899223344556677');
      expect(result.allowSuffix).toBe(false);
    });

    it('FedEx 12-digit Tracking (527961359853) debe ser DISCRETE_ALPHANUMERIC', () => {
      const result = canonicalizeTracking('527961359853');
      expect(result.carrierType).toBe('DISCRETE_ALPHANUMERIC');
      expect(result.carrier).toBe('FEDEX');
      expect(result.canonicalTracking).toBe('527961359853');
      expect(result.allowSuffix).toBe(false);
    });
  });

  describe('Category 3: Symbology Cleaner & Input Sanitization', () => {
    it('Limpia caracteres de simbología AIM ]C1, ]e0, espacios, guiones y mayúsculas', () => {
      expect(cleanRawTracking(']C142033166 9400111899223344556677')).toBe('420331669400111899223344556677');
      expect(cleanRawTracking(']e01Z-8V76X8-0398-4806-03')).toBe('1Z8V76X80398480603');
      expect(cleanRawTracking('  gfus 0106-5635_648649 \n\t')).toBe('GFUS01065635648649');
      expect(cleanRawTracking('')).toBe('');
    });

    it('Verifica inclusión de todos los códigos postales de almacenes de Miami', () => {
      expect(MIAMI_WAREHOUSE_ZIPS).toContain('33166');
      expect(MIAMI_WAREHOUSE_ZIPS).toContain('33122');
      expect(MIAMI_WAREHOUSE_ZIPS).toContain('33192');
      expect(MIAMI_WAREHOUSE_ZIPS).toContain('33178');
      expect(MIAMI_WAREHOUSE_ZIPS).toContain('33172');
    });
  });

  describe('Category 4: Real Nova Table Live Manifest Manifestation Suite (Image Extraction)', () => {
    it('SPXMIA007982608040000996 (Shopee Express - Gilberto Jimenez SL261337) debe ser SPX DISCRETE', () => {
      const res = canonicalizeTracking('SPXMIA007982608040000996');
      expect(res.carrierType).toBe('DISCRETE_ALPHANUMERIC');
      expect(res.carrier).toBe('SPX');
      expect(res.canonicalTracking).toBe('SPXMIA007982608040000996');
      expect(res.allowSuffix).toBe(false);
    });

    it('SPXMIA007982608030009344 (Shopee Express - Gilberto Jimenez SL261337) debe ser SPX DISCRETE', () => {
      const res = canonicalizeTracking('SPXMIA007982608030009344');
      expect(res.carrierType).toBe('DISCRETE_ALPHANUMERIC');
      expect(res.carrier).toBe('SPX');
      expect(res.canonicalTracking).toBe('SPXMIA007982608030009344');
      expect(res.allowSuffix).toBe(false);
    });

    it('GFUS01065926676932 (Hillary Ledezma SL1989) debe ser SPEEDLOGISTICS DISCRETE sin cortes', () => {
      const res = canonicalizeTracking('GFUS01065926676932');
      expect(res.carrierType).toBe('DISCRETE_ALPHANUMERIC');
      expect(res.carrier).toBe('SPEEDLOGISTICS');
      expect(res.canonicalTracking).toBe('GFUS01065926676932');
      expect(res.allowSuffix).toBe(false);
    });

    it('SPXMIA013672608020009567 (Jacqueline Chacon SL262163) debe ser SPX DISCRETE', () => {
      const res = canonicalizeTracking('SPXMIA013672608020009567');
      expect(res.carrierType).toBe('DISCRETE_ALPHANUMERIC');
      expect(res.carrier).toBe('SPX');
      expect(res.canonicalTracking).toBe('SPXMIA013672608020009567');
      expect(res.allowSuffix).toBe(false);
    });

    it('1Z1R054E0343790488 (UPS - Jimena Gamboa Abarca SL162) debe ser UPS DISCRETE', () => {
      const res = canonicalizeTracking('1Z1R054E0343790488');
      expect(res.carrierType).toBe('DISCRETE_ALPHANUMERIC');
      expect(res.carrier).toBe('UPS');
      expect(res.canonicalTracking).toBe('1Z1R054E0343790488');
      expect(res.allowSuffix).toBe(false);
    });

    it('9632080400208194694100875411686022 (USPS 34 dígitos - Jimena Sibaja SL26363)', () => {
      const res = canonicalizeTracking('9632080400208194694100875411686022');
      expect(res.carrierType).toBe('POSTAL_COMPOSITE');
      expect(res.carrier).toBe('USPS');
      expect(res.canonicalTracking).toBe('9632080400208194694100875411686022');
      expect(res.allowSuffix).toBe(false);
    });

    it('TBA333410000628 y 1Z22W1390320764506 (Kevin Salazar Jimenez SL26040)', () => {
      const res1 = canonicalizeTracking('TBA333410000628');
      expect(res1.carrier).toBe('AMAZON');
      expect(res1.allowSuffix).toBe(false);

      const res2 = canonicalizeTracking('1Z22W1390320764506');
      expect(res2.carrier).toBe('UPS');
      expect(res2.allowSuffix).toBe(false);
    });
  });
});
