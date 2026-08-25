import { describe, it, expect } from 'vitest';

describe('Error pages — HTTP status helpers', () => {
  const HTTP_STATUS = { NOT_FOUND: 404, FORBIDDEN: 403, SERVER_ERROR: 500 };

  it('404 maps to NotFound', () => expect(HTTP_STATUS.NOT_FOUND).toBe(404));
  it('403 maps to Forbidden', () => expect(HTTP_STATUS.FORBIDDEN).toBe(403));
  it('500 maps to ServerError', () => expect(HTTP_STATUS.SERVER_ERROR).toBe(500));

  it('determines redirect path for error codes', () => {
    const errorRedirect = (code: number) => {
      if (code === 404) return '/not-found';
      if (code === 403) return '/forbidden';
      return '/error';
    };
    expect(errorRedirect(404)).toBe('/not-found');
    expect(errorRedirect(403)).toBe('/forbidden');
    expect(errorRedirect(500)).toBe('/error');
  });

  it('classifies error as client or server side', () => {
    const isClientError = (code: number) => code >= 400 && code < 500;
    expect(isClientError(404)).toBe(true);
    expect(isClientError(403)).toBe(true);
    expect(isClientError(500)).toBe(false);
  });
});
