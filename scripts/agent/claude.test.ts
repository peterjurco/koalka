import { describe, it, expect, vi } from 'vitest';
import { isFatalApiError, withRetry } from './claude.ts';

function httpError(status: number): Error {
  return Object.assign(new Error(`HTTP ${status}`), { status });
}

describe('isFatalApiError', () => {
  it('treats a 400 as fatal', () => {
    expect(isFatalApiError(httpError(400))).toBe(true);
  });

  it('treats a 429 as retryable', () => {
    expect(isFatalApiError(httpError(429))).toBe(false);
  });

  it('treats a 500 as retryable', () => {
    expect(isFatalApiError(httpError(500))).toBe(false);
  });

  it('treats a network error with no status as retryable', () => {
    expect(isFatalApiError(new Error('socket hang up'))).toBe(false);
  });
});

describe('withRetry', () => {
  it('returns the value on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    await expect(withRetry(fn, { baseDelayMs: 0 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries a transient failure and then succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(httpError(500))
      .mockResolvedValue('ok');
    await expect(withRetry(fn, { baseDelayMs: 0 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('gives up after the configured number of attempts', async () => {
    const fn = vi.fn().mockRejectedValue(httpError(500));
    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 0 })).rejects.toThrow('HTTP 500');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry a fatal error', async () => {
    const fn = vi.fn().mockRejectedValue(httpError(400));
    await expect(withRetry(fn, { baseDelayMs: 0 })).rejects.toThrow('HTTP 400');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
