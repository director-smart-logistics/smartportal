import { describe, it, expect } from 'vitest';
import { suggestedEncomiendaName, applyEncomiendaSuggestion } from '../src/customers/encomienda-suggestion';

describe('F8.2 suggestedEncomiendaName', () => {
  it('the proposed name when there is no official service', () => {
    expect(suggestedEncomiendaName({ encomiendaPendingReview: true, encomiendaSubmittedName: '  Transportes Tico ' })).toBe('Transportes Tico');
  });
  it('none when the address has an official service or no proposal', () => {
    expect(suggestedEncomiendaName({ encomiendaSubmittedName: 'X', encomienda: { name: 'Correos' } })).toBeNull();
    expect(suggestedEncomiendaName({})).toBeNull();
    expect(suggestedEncomiendaName({ encomiendaSubmittedName: '   ' })).toBeNull();
  });
});

describe('F8.2 applyEncomiendaSuggestion', () => {
  it('adds the note at the start of the delivery instructions (the label prints them)', () => {
    expect(applyEncomiendaSuggestion({ encomiendaSuggestedName: 'Transportes Tico', deliveryInstructions: 'Portón negro' }))
      .toMatchObject({ encomiendaSuggestedName: 'Transportes Tico', deliveryInstructions: 'Encomienda sugerida por el cliente: Transportes Tico (por confirmar) · Portón negro' });
  });
  it('never duplicates the note on every sync', () => {
    const once = applyEncomiendaSuggestion({ encomiendaSuggestedName: 'T', deliveryInstructions: null });
    expect(applyEncomiendaSuggestion(once).deliveryInstructions).toBe('Encomienda sugerida por el cliente: T (por confirmar)');
  });
  it('an official service (SP2 list or SP1 admin) removes the suggestion and its note', () => {
    const a = applyEncomiendaSuggestion({ encomiendaSuggestedName: 'T', deliveryInstructions: 'Encomienda sugerida por el cliente: T (por confirmar) · Portón negro', encomienda: { name: 'Correos CR' } });
    expect(a).toMatchObject({ encomiendaSuggestedName: null, deliveryInstructions: 'Portón negro' });
  });
  it('address without encomienda: instructions unchanged', () => {
    expect(applyEncomiendaSuggestion({ deliveryInstructions: 'Casa 4' })).toMatchObject({ encomiendaSuggestedName: null, deliveryInstructions: 'Casa 4' });
    expect(applyEncomiendaSuggestion({})).toMatchObject({ encomiendaSuggestedName: null, deliveryInstructions: null });
  });
});
