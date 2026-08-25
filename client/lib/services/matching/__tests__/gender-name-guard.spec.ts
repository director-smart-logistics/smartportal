import { describe, it, expect } from 'vitest';
import { areDistinctGivenNames } from '../gender-name-guard';
import { tokensMatch } from '../algorithms';
import { isDivergentMatch } from '../../manifest-processor/parser';

describe('Gender and Distinct Given Name Guard', () => {
  it('identifies distinct / opposite gender given names', () => {
    expect(areDistinctGivenNames('DANIEL', 'DANIELA')).toBe(true);
    expect(areDistinctGivenNames('DANIELA', 'DANIEL')).toBe(true);
    expect(areDistinctGivenNames('VICTOR', 'VICTORIA')).toBe(true);
    expect(areDistinctGivenNames('GABRIEL', 'GABRIELA')).toBe(true);
    expect(areDistinctGivenNames('MARIO', 'MARIA')).toBe(true);
    expect(areDistinctGivenNames('ADRIAN', 'ADRIANA')).toBe(true);
    expect(areDistinctGivenNames('JULIAN', 'JULIANA')).toBe(true);
    expect(areDistinctGivenNames('CARLOS', 'CARLA')).toBe(true);
    expect(areDistinctGivenNames('LUIS', 'LUISA')).toBe(true);
    expect(areDistinctGivenNames('FERNANDO', 'FERNANDA')).toBe(true);
    expect(areDistinctGivenNames('ALEJANDRO', 'ALEJANDRA')).toBe(true);
    expect(areDistinctGivenNames('ANDRES', 'ANDREA')).toBe(true);
    expect(areDistinctGivenNames('ROBERTO', 'ROBERTA')).toBe(true);
  });

  it('does NOT flag identical names or non-gender typos as distinct given names', () => {
    expect(areDistinctGivenNames('DANIEL', 'DANIEL')).toBe(false);
    expect(areDistinctGivenNames('DANIEL', 'DANEL')).toBe(false);
    expect(areDistinctGivenNames('RODRIGUEZ', 'RODRIGEZ')).toBe(false);
    expect(areDistinctGivenNames('GONZALEZ', 'GONZALES')).toBe(false);
    expect(areDistinctGivenNames('VALVERDE', 'BALBERDE')).toBe(false);
  });

  it('ensures tokensMatch rejects distinct given names', () => {
    expect(tokensMatch('DANIEL', 'DANIELA')).toBe(false);
    expect(tokensMatch('VICTOR', 'VICTORIA')).toBe(false);
    expect(tokensMatch('MARIO', 'MARIA')).toBe(false);
    expect(tokensMatch('GABRIEL', 'GABRIELA')).toBe(false);
    expect(tokensMatch('ADRIAN', 'ADRIANA')).toBe(false);
  });

  it('ensures tokensMatch still allows genuine typos and phonetic equivalents', () => {
    expect(tokensMatch('DANIEL', 'DANEL')).toBe(true);
    expect(tokensMatch('RODRIGUEZ', 'RODRIGEZ')).toBe(true);
    expect(tokensMatch('GONZALEZ', 'GONZALES')).toBe(true);
    expect(tokensMatch('JIMENEZ', 'JIMENES')).toBe(true);
    expect(tokensMatch('PEPE', 'JOSE')).toBe(true); // Nickname
  });

  it('ensures isDivergentMatch detects divergence when only first name differs by gender', () => {
    expect(isDivergentMatch('DANIEL RODRIGUEZ', 'DANIELA DE LOS ANGELES RODRIGUEZ FUENTES')).toBe(true);
    expect(isDivergentMatch('VICTOR BARQUERO', 'VICTORIA BARQUERO ARANA')).toBe(true);
    expect(isDivergentMatch('MARIO VARGAS', 'MARIA VARGAS MORA')).toBe(true);
    expect(isDivergentMatch('GABRIEL ALFARO', 'GABRIELA ALFARO RAMIREZ')).toBe(true);
  });

  it('ensures isDivergentMatch allows genuine first name typos', () => {
    // ABERTO -> ALBERTO (1 letter typo)
    expect(isDivergentMatch('ABERTO JIMENEZ MONGE', 'ALBERTO JIMENEZ MONGE')).toBe(false);
    // DANEL -> DANIEL (1 letter typo)
    expect(isDivergentMatch('DANEL RODRIGUEZ GONZALEZ', 'DANIEL RODRIGUEZ GONZALEZ')).toBe(false);
  });
});
