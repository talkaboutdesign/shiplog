"use node";

import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";

export interface UserApiKeys {
  openai?: string;
  anthropic?: string;
  openrouter?: string;
  openrouterModel?: string;
  preferredProvider?: "openai" | "anthropic" | "openrouter";
}

export interface ModelConfig {
  model: LanguageModel; // AI SDK 6 LanguageModel type (accepts LanguageModelV2 from providers)
  apiKey: string;
  provider: "openai" | "anthropic" | "openrouter";
}

/**
 * Get model configuration from user's API keys
 * Respects preferredProvider and openrouterModel
 */
export function getUserModelConfig(userApiKeys: UserApiKeys): ModelConfig {
  const provider = userApiKeys.preferredProvider || "openai";
  let apiKey: string | undefined;
  let model: any;

  // Get API key for preferred provider
  if (provider === "openai") {
    apiKey = userApiKeys.openai;
    if (!apiKey) {
      throw new Error("No OpenAI API key configured");
    }
    const openai = createOpenAI({ apiKey });
    model = openai("gpt-4o-mini") as LanguageModel;
  } else if (provider === "anthropic") {
    apiKey = userApiKeys.anthropic;
    if (!apiKey) {
      throw new Error("No Anthropic API key configured");
    }
    const anthropic = createAnthropic({ apiKey });
    model = anthropic("claude-3-5-haiku-latest") as LanguageModel;
  } else {
    // OpenRouter
    apiKey = userApiKeys.openrouter;
    if (!apiKey) {
      throw new Error("No OpenRouter API key configured");
    }
    const modelName = userApiKeys.openrouterModel || "openai/gpt-4o-mini";
    
    // For Anthropic models through OpenRouter, use Anthropic SDK with OpenRouter baseURL
    if (modelName.startsWith("anthropic/")) {
      const anthropic = createAnthropic({
        apiKey,
        baseURL: "https://openrouter.ai/api/v1",
      });
      model = anthropic(modelName) as LanguageModel;
    } else {
      // For OpenAI and other models, use OpenAI SDK provider with OpenRouter baseURL
      const openrouter = createOpenAI({
        apiKey,
        baseURL: "https://openrouter.ai/api/v1",
      });
      model = openrouter(modelName) as LanguageModel;
    }
  }

  return { model, apiKey, provider };
}

/**
 * Get fast model for impact analysis (always uses fastest model regardless of user selection)
 */
export function getFastModelConfig(userApiKeys: UserApiKeys): ModelConfig {
  const provider = userApiKeys.preferredProvider || "openai";
  let apiKey: string | undefined;
  let model: any;

  if (provider === "openai") {
    apiKey = userApiKeys.openai;
    if (!apiKey) {
      throw new Error("No OpenAI API key configured");
    }
    const openai = createOpenAI({ apiKey });
    model = openai("gpt-4o-mini") as LanguageModel;
  } else if (provider === "anthropic") {
    apiKey = userApiKeys.anthropic;
    if (!apiKey) {
      throw new Error("No Anthropic API key configured");
    }
    const anthropic = createAnthropic({ apiKey });
    model = anthropic("claude-3-5-haiku-latest") as LanguageModel;
  } else {
    // OpenRouter - use gpt-4o-mini for fastest + most reliable structured output
    apiKey = userApiKeys.openrouter;
    if (!apiKey) {
      throw new Error("No OpenRouter API key configured");
    }
    const openrouter = createOpenAI({
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
    });
    model = openrouter("openai/gpt-4o-mini") as LanguageModel;
  }

  return { model, apiKey, provider };
}
