const OpenAI = require("openai");
require('dotenv/config');
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  PutCommand,
  ScanCommand,
} = require("@aws-sdk/lib-dynamodb");
const crypto = require("crypto");

// Módulos locales de herramientas y funciones
const functionsRegistry = require('./ai-functions');
const tools = require('./ai-tools');

// ── DynamoDB client ──────────────────────────────────────────────────────────
const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });
const dynamo = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: { removeUndefinedValues: true },
});

const DYNAMO_TABLE = process.env.DYNAMODB_TABLE_NAME;

if (!DYNAMO_TABLE) {
  console.warn("[DynamoDB Warning] DYNAMODB_TABLE_NAME is not set. Semantic cache will be disabled.");
}

// ── DeepSeek / OpenAI clients ────────────────────────────────────────────────

// Cliente oficial de DeepSeek (vía OpenAI SDK)
const deepseek = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY,
});

// Cliente auxiliar para Embeddings Semánticos (text-embedding-3-small)
const embeddingClient = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
});

// ── Semantic cache constants ──────────────────────────────────────────────────
const VECTOR_DIM = 1536;
const SIMILARITY_THRESHOLD = 0.15; // cosine distance; lower = more similar

// ── Tier / model routing ──────────────────────────────────────────────────────
const TIERS = {
  LIGHT: 'light',
  HEAVY: 'heavy',
};

const MODEL_MAP = {
  [TIERS.LIGHT]: 'deepseek-chat',
  [TIERS.HEAVY]: 'deepseek-reasoner',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Compute cosine distance between two JS number arrays.
 * Returns 0 for identical vectors, 2 for perfectly opposite.
 * Lower distance = higher similarity.
 */
function cosineDistance(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 1; // treat zero-vector as maximally distant
  return 1 - (dot / denom);
}

/**
 * Calculador de Complejidad / Router Heurístico
 */
function aiRouter(prompt) {
  let score = 0;
  const length = prompt.length;

  if (length > 1500) score += 40;
  else if (length > 500) score += 20;

  const heavyKeywords = /\b(plan|weekly plan|strict restrictions|calculate exact macros|break down|complex substitution|reason|step-by-step)\b/gi;
  const keywordMatches = (prompt.match(heavyKeywords) || []).length;
  score += Math.min(keywordMatches * 15, 30);

  const multiQueryMatches = (prompt.match(/\?|\n-|\n\d\./g) || []).length;
  if (multiQueryMatches > 3) score += 15;

  const tier = score >= 40 ? TIERS.HEAVY : TIERS.LIGHT;

  console.log(`[AI Router] Prompt length: ${length} | Score: ${score} | Assigned Tier: ${tier.toUpperCase()}`);

  return { score, tier };
}

/**
 * Genera el embedding vectorial del prompt usando text-embedding-3-small.
 * @param {string} text
 * @returns {Promise<number[]>}
 */
async function generateEmbedding(text) {
  const response = await embeddingClient.embeddings.create({
    model: "text-embedding-3-small",
    input: text.trim().toLowerCase(),
  });
  return response.data[0].embedding;
}

/**
 * Scan the DynamoDB cache table and return the closest semantic match.
 *
 * Strategy: full table scan with in-process cosine similarity.
 * This is acceptable because:
 *   - The table uses PAY_PER_REQUEST so there is no provisioned cost.
 *   - Lambda cold-start aside, the cache is meant to be small (hundreds of
 *     entries for a culinary app), not millions.
 *   - DynamoDB does not natively support ANN/KNN vector search; alternatives
 *     like Amazon OpenSearch would reintroduce network infrastructure costs.
 *
 * @param {number[]} queryVector
 * @returns {Promise<{cachedResponse: object, originalPrompt: string, distance: number}|null>}
 */
async function findSemanticMatch(queryVector) {
  if (!DYNAMO_TABLE) return null;

  try {
    // Scan returns all non-expired items (DynamoDB TTL eviction is eventual,
    // so we also guard with a manual ttl check below).
    const nowEpoch = Math.floor(Date.now() / 1000);
    const result = await dynamo.send(
      new ScanCommand({
        TableName: DYNAMO_TABLE,
        // Only project the fields we actually need to keep payload small
        ProjectionExpression: "pk, prompt, response_json, embedding, ttl",
      })
    );

    const items = (result.Items || []).filter(
      (item) => !item.ttl || item.ttl > nowEpoch
    );

    if (items.length === 0) return null;

    let bestMatch = null;
    let bestDistance = Infinity;

    for (const item of items) {
      if (!item.embedding) continue;

      // Embedding stored as a JSON-serialised number array
      const storedVector = JSON.parse(item.embedding);
      if (!Array.isArray(storedVector) || storedVector.length !== VECTOR_DIM) continue;

      const distance = cosineDistance(queryVector, storedVector);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestMatch = item;
      }
    }

    if (bestMatch && bestDistance <= SIMILARITY_THRESHOLD) {
      return {
        cachedResponse: JSON.parse(bestMatch.response_json),
        originalPrompt: bestMatch.prompt,
        distance: bestDistance,
      };
    }
  } catch (err) {
    console.warn("[Semantic Cache Warning] Error scanning DynamoDB:", err.message);
  }

  return null;
}

/**
 * Persist a prompt + its embedding + the LLM response in DynamoDB.
 * TTL is stored as a Unix epoch so DynamoDB's native TTL eviction handles cleanup.
 *
 * @param {string}   prompt
 * @param {number[]} queryVector
 * @param {object}   responseData
 * @param {number}   ttlSeconds   - default 24 h
 */
async function storeSemanticCache(prompt, queryVector, responseData, ttlSeconds = 86400) {
  if (!DYNAMO_TABLE) return;

  try {
    const pk = `cache:semantic:${Date.now()}:${crypto.randomBytes(4).toString('hex')}`;
    const ttlEpoch = Math.floor(Date.now() / 1000) + ttlSeconds;

    await dynamo.send(
      new PutCommand({
        TableName: DYNAMO_TABLE,
        Item: {
          pk,
          prompt,
          response_json: JSON.stringify(responseData),
          // Store as compact JSON string — avoids DynamoDB Number precision limits
          // and keeps the item well within the 400 KB item size limit for 1536-dim vectors.
          embedding: JSON.stringify(queryVector),
          ttl: ttlEpoch,
          createdAt: new Date().toISOString(),
        },
      })
    );

    console.log(`💾 [DYNAMO WRITTEN] Semantic cache entry stored (pk: ${pk}, TTL: ${ttlSeconds}s / expires: ${new Date(ttlEpoch * 1000).toISOString()})`);
  } catch (err) {
    console.warn("[Semantic Cache Warning] Failed to write to DynamoDB:", err.message);
  }
}

// ── DeepSeek fallback ─────────────────────────────────────────────────────────

async function deepseekChatFallback(payload) {
  const axios = require('axios');
  const url = 'https://api.deepseek.com/chat/completions';
  const headers = {
    'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    'Content-Type': 'application/json',
  };

  try {
    const resp = await axios.post(url, payload, { headers });
    return resp.data;
  } catch (err) {
    if (err.response) {
      const e = new Error(`DeepSeek fallback request failed: ${err.response.status} ${err.response.statusText}`);
      e.details = { status: err.response.status, data: err.response.data };
      throw e;
    }
    throw err;
  }
}

// ── Main orchestrator ─────────────────────────────────────────────────────────

/**
 * Función Principal de Análisis Estratégico con Semantic Caching (DynamoDB).
 */
async function ejecutarAnalisisEstrategico(
  userInput,
  {
    tools: customTools = tools,
    functionsRegistry: customRegistry = functionsRegistry,
    ttlSeconds = 86400,
  } = {}
) {
  const startTime = Date.now();

  // =========================================================
  // PASO 1: SEMANTIC CACHE LOOKUP (Read-Through — DynamoDB)
  // =========================================================
  let promptVector = null;
  try {
    promptVector = await generateEmbedding(userInput);
    const cacheMatch = await findSemanticMatch(promptVector);

    if (cacheMatch) {
      const executionTimeMs = Date.now() - startTime;
      const similarityPercent = ((1 - cacheMatch.distance) * 100).toFixed(2);

      console.log(`\n==================================================`);
      console.log(`🎯 [SEMANTIC CACHE HIT] Coincidencia semántica detectada!`);
      console.log(`--------------------------------------------------`);
      console.log(`📊 REPORTE DE RENDIMIENTO (SEMANTIC CACHE — DynamoDB):`);
      console.log(` • Prompt Nuevo:     "${userInput}"`);
      console.log(` • Prompt Cacheado:  "${cacheMatch.originalPrompt}"`);
      console.log(` • Similitud:        ${similarityPercent}% (Distancia Cos: ${cacheMatch.distance.toFixed(4)})`);
      console.log(` • Modelo Original:  ${cacheMatch.cachedResponse.modelUsed}`);
      console.log(` • Tiempo Respuesta: ${executionTimeMs} ms`);
      console.log(` • Costo API LLM:    $0.0000 USD (Ahorro del 100%)`);
      console.log(`==================================================\n`);

      return { status: "cache-hit", ...cacheMatch.cachedResponse };
    }
  } catch (err) {
    console.warn("[Semantic Cache Warning] Error en la caché semántica, se continúa con LLM directo:", err.message);
  }

  // =========================================================
  // PASO 2: CACHE MISS — EJECUCIÓN CON DEEPSEEK
  // =========================================================
  console.log(`⚡ [SEMANTIC CACHE MISS] Ejecutando análisis en vivo con DeepSeek...`);

  const { tier, score } = aiRouter(userInput);
  const selectedModel = MODEL_MAP[tier];

  const messages = [
    {
      role: "system",
      content: `You are an expert culinary assistant and nutritionist. Your goal is to help users plan meals, find recipes, suggest ingredient substitutes, and analyze the nutritional content of their dishes.
      Behavior Guidelines:
      1. TOOL USAGE: You have access to native tools to query the Spoonacular API. Always use these tools when you need precise information about recipes, ingredients, nutritional values, or cuisines.
      2. AUTOMATIC TRANSLATION: The external API works best in English. Always translate user search terms (ingredients, dish names, cuisines) into English before passing them as arguments to your function calls (e.g., use "butter" instead of "mantequilla").
      3. USER RESPONSES: Always respond in the language the user speaks to you (e.g., Spanish, English, etc.). Present recipe results in a structured, clear, and appetizing format.
      4. FORMATTING: When returning recipes, include the title, a brief description, and key details (such as preparation time or nutritional values if retrieved).
      5. LIMITATIONS: If a tool returns no results, politely ask the user to rephrase their search. DO NOT come up with information or make up recipes or ingredients. If you cannot find a recipe, suggest alternatives using the tools or ask for more details.
      6. MUST reply in English`,
    },
    {
      role: "user",
      content: userInput,
    },
  ];

  const MAX_TURNS = 5;
  let turn = 0;

  try {
    while (turn < MAX_TURNS) {
      turn++;
      let respuesta;

      const apiOptions = {
        model: selectedModel,
        messages,
      };

      if (customTools && customTools.length > 0) {
        apiOptions.tools = customTools;
        apiOptions.tool_choice = "auto";
      }

      try {
        respuesta = await deepseek.chat.completions.create(apiOptions);
      } catch (err) {
        if (err && err.status === 403) {
          console.warn('OpenAI client returned 403 — attempting fallback execution.');
          respuesta = await deepseekChatFallback(apiOptions);
        } else {
          throw err;
        }
      }

      const choice = respuesta.choices && respuesta.choices[0];
      const mensajeDeIA = choice && choice.message;

      if (!mensajeDeIA) {
        throw new Error("No response message received from DeepSeek model.");
      }

      messages.push(mensajeDeIA);

      if (mensajeDeIA.tool_calls && mensajeDeIA.tool_calls.length > 0) {
        for (const toolCall of mensajeDeIA.tool_calls) {
          const nombreFuncion = toolCall.function.name;
          const args = JSON.parse(toolCall.function.arguments || "{}");

          console.log(`Executing tool: ${nombreFuncion} with args:`, args);

          let resultado;
          if (customRegistry[nombreFuncion]) {
            resultado = await customRegistry[nombreFuncion](args);
          } else {
            resultado = { error: `Function ${nombreFuncion} not implemented in registry.` };
          }

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(resultado),
          });
        }
      } else {
        const executionTimeMs = Date.now() - startTime;

        const finalResult = {
          success: true,
          query: userInput,
          modelUsed: selectedModel,
          complexityScore: score,
          analysis: mensajeDeIA.content,
        };

        // =========================================================
        // PASO 3: ALMACENAR EN DYNAMODB SEMANTIC CACHE
        // =========================================================
        if (promptVector) {
          await storeSemanticCache(userInput, promptVector, finalResult, ttlSeconds);
        }

        return {
          ...finalResult,
          cached: false,
          executionTimeMs,
        };
      }
    }

    return {
      success: false,
      query: userInput,
      analysis: "Exceeded maximum tool calling iterations.",
    };
  } catch (error) {
    console.error("Critical Execution Error:", error);
    return {
      success: false,
      query: userInput,
      analysis: "Internal error processing the nutritional request.",
    };
  }
}

module.exports = {
  ejecutarAnalisisEstrategico,
  deepseekChatFallback,
  aiRouter,
  generateEmbedding,
  findSemanticMatch,
  storeSemanticCache,
};
