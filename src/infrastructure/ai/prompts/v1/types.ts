export interface PromptTemplate<TVars extends Record<string, unknown>> {
  /** ai_generation_logs.prompt_template_id に記録する識別子 */
  readonly id: string;
  readonly systemInstruction: string;
  build(vars: TVars): string;
  readonly responseJsonSchema: Record<string, unknown>;
  readonly generationConfig: {
    temperature: number;
    maxOutputTokens: number;
  };
}
