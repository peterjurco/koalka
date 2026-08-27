import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  isFatal?: (error: unknown) => boolean;
}

/**
 * A 4xx other than rate limiting means the request itself is wrong — retrying just burns
 * time and money. Everything else (429, 5xx, network) is worth another attempt.
 */
export function isFatalApiError(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' && status >= 400 && status < 500 && status !== 429;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 2000;
  const isFatal = options.isFatal ?? isFatalApiError;

  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (isFatal(error) || attempt === attempts - 1) break;
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** attempt));
    }
  }
  throw lastError;
}

export interface ParseJsonParams<T> {
  model: string;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  maxTokens?: number;
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
}

/** The only interface the rest of the agent knows about. Tests pass a fake. */
export interface ModelClient {
  parseJson<T>(params: ParseJsonParams<T>): Promise<T | null>;
}

/**
 * Anthropic-backed ModelClient. Credentials come from ANTHROPIC_API_KEY in the
 * environment; the SDK reads it itself.
 *
 * maxRetries: 0 disables the SDK's own internal retries — withRetry above is the
 * sole retry layer. Without this, the two layers stack (withRetry's 3 attempts each
 * triggering up to 3 SDK-internal attempts) into up to 9 real HTTP calls with two
 * independently-compounding exponential backoffs. Do not remove this as "redundant".
 */
export function createModelClient(client: Anthropic = new Anthropic({ maxRetries: 0 })): ModelClient {
  return {
    async parseJson<T>({
      model,
      system,
      user,
      schema,
      maxTokens = 16000,
      effort = 'high',
    }: ParseJsonParams<T>): Promise<T | null> {
      const response = await withRetry(() =>
        client.messages.parse({
          model,
          max_tokens: maxTokens,
          system,
          messages: [{ role: 'user', content: user }],
          output_config: {
            format: zodOutputFormat(schema as never),
            effort,
          },
        }),
      );
      return (response.parsed_output as T | null) ?? null;
    },
  };
}
