export interface GeminiGenerateJsonParams {
  systemInstruction: string;
  userPrompt: string;
  responseSchema: Record<string, unknown>;
  generationConfig: {
    temperature: number;
    maxOutputTokens: number;
  };
}

export interface GeminiGenerateJsonResult {
  json: unknown;
  rawResponse: unknown;
  tokenUsage: {
    requestTokens: number;
    responseTokens: number;
  };
  latencyMs: number;
}

export interface GeminiEmbedParams {
  text: string;
  taskType?: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' | 'SEMANTIC_SIMILARITY';
}

interface GeminiApiResponse {
  candidates: Array<{
    content: {
      parts: Array<{ text: string }>;
      role: string;
    };
    finishReason: string;
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

interface GeminiEmbedApiResponse {
  embedding: {
    values: number[];
  };
}

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const NETWORK_TIMEOUT_MS = 30_000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class GeminiClient {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = 'gemini-1.5-flash',
    private readonly embeddingModel: string = 'text-embedding-004',
  ) {}

  async generateJson(params: GeminiGenerateJsonParams): Promise<GeminiGenerateJsonResult> {
    const url = `${BASE_URL}/${this.model}:generateContent?key=${this.apiKey}`;

    const body = {
      system_instruction: {
        parts: [{ text: params.systemInstruction }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: params.userPrompt }],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: params.responseSchema,
        temperature: params.generationConfig.temperature,
        maxOutputTokens: params.generationConfig.maxOutputTokens,
      },
    };

    const start = Date.now();
    const rawResponse = await this.fetchWithRetry(url, body);
    const latencyMs = Date.now() - start;

    const api = rawResponse as GeminiApiResponse;
    const text = api.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Gemini returned non-JSON content: ${text.slice(0, 200)}`);
    }

    return {
      json,
      rawResponse,
      tokenUsage: {
        requestTokens: api.usageMetadata?.promptTokenCount ?? 0,
        responseTokens: api.usageMetadata?.candidatesTokenCount ?? 0,
      },
      latencyMs,
    };
  }

  async embed(params: GeminiEmbedParams): Promise<{ values: number[] }> {
    const url = `${BASE_URL}/${this.embeddingModel}:embedContent?key=${this.apiKey}`;

    const body = {
      model: `models/${this.embeddingModel}`,
      content: {
        parts: [{ text: params.text }],
      },
      taskType: params.taskType ?? 'RETRIEVAL_DOCUMENT',
    };

    const rawResponse = await this.fetchWithRetry(url, body);
    const api = rawResponse as GeminiEmbedApiResponse;
    return { values: api.embedding.values };
  }

  private async fetchWithRetry(url: string, body: unknown): Promise<unknown> {
    const MAX_RETRIES = 2;
    const BACKOFF_MS = [500, 2000] as const;

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      let response: Response;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);

        try {
          response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeoutId);
        }
      } catch (err) {
        // ネットワークエラー / タイムアウト
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < MAX_RETRIES) {
          await sleep(1000);
          continue;
        }
        throw lastError;
      }

      if (response.ok) {
        return response.json();
      }

      // 4xx は即失敗（プロンプト・認証バグ）
      if (response.status >= 400 && response.status < 500) {
        const text = await response.text().catch(() => '');
        throw new Error(`Gemini API error ${response.status}: ${text.slice(0, 300)}`);
      }

      // 429 レート制限
      if (response.status === 429) {
        if (attempt >= MAX_RETRIES) break;
        const retryAfter = response.headers.get('Retry-After');
        const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 2000;
        await sleep(waitMs);
        lastError = new Error(`Gemini rate limited (429)`);
        continue;
      }

      // 5xx サーバーエラー
      if (attempt < MAX_RETRIES) {
        await sleep(BACKOFF_MS[attempt] ?? 2000);
        lastError = new Error(`Gemini server error ${response.status}`);
        continue;
      }

      const text = await response.text().catch(() => '');
      throw new Error(`Gemini server error ${response.status}: ${text.slice(0, 300)}`);
    }

    throw lastError ?? new Error('Gemini request failed after retries');
  }
}
