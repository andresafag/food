/**
 * spoonacular-cache.js
 *
 * Server-side proxy + DynamoDB cache for all Spoonacular API calls.
 *
 * Flow:
 *   1. Client POSTs { endpoint, params } to /spoonacular on the Express server.
 *   2. Server builds a deterministic cache key (SHA-256 of endpoint + sorted params).
 *   3. GetItem from DynamoDB — cache HIT returns stored JSON immediately.
 *   4. Cache MISS: fetch Spoonacular, store response in DynamoDB with TTL, return data.
 *
 * Why a deterministic key instead of a Scan?
 *   - DynamoDB GetItem is O(1) and costs a single read unit regardless of table size.
 *   - The same query (same endpoint + same params) always produces the same SHA-256 hash,
 *     so repeated lookups from different Lambda instances or warm containers will all hit
 *     the same DynamoDB item without any coordination overhead.
 */

const crypto  = require('crypto');
const https   = require('https');
const { DynamoDBClient }         = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');

// ── DynamoDB client ──────────────────────────────────────────────────────────
const ddb    = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const dynamo = DynamoDBDocumentClient.from(ddb, {
  marshallOptions: { removeUndefinedValues: true },
});

const TABLE = process.env.SPOONACULAR_CACHE_TABLE;

if (!TABLE) {
  console.warn('[SpoonacularCache] SPOONACULAR_CACHE_TABLE is not set — caching disabled.');
}

// How long to keep cached Spoonacular responses (seconds).
// 1 hour is a good default: fresh enough for recipe data, generous enough to
// absorb repeated searches within a session.
const DEFAULT_TTL_SECONDS = 3600;

// Base URL for the Spoonacular v1 API
const SPOONACULAR_BASE = 'https://api.spoonacular.com';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a stable, URL-safe cache key from an endpoint path and a params object.
 * Params are sorted alphabetically before hashing so that
 * { a:1, b:2 } and { b:2, a:1 } produce the same key.
 * The API key is stripped before hashing to avoid key proliferation when keys rotate.
 */
function buildCacheKey(endpoint, params) {
  const sanitized = Object.assign({}, params);
  delete sanitized.apiKey;

  const sortedParams = Object.keys(sanitized)
    .sort()
    .map(k => `${k}=${sanitized[k]}`)
    .join('&');

  const raw = `${endpoint}?${sortedParams}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * Simple promise wrapper around Node's built-in https.get.
 * Avoids adding axios as a production dependency just for server-side fetches.
 */
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    }).on('error', reject);
  });
}

// ── Cache read / write ────────────────────────────────────────────────────────

async function readCache(cacheKey) {
  if (!TABLE) return null;
  try {
    const result = await dynamo.send(new GetCommand({
      TableName: TABLE,
      Key: { cacheKey },
    }));
    const item = result.Item;
    if (!item) return null;

    // Guard against DynamoDB TTL eviction lag (items can linger up to ~48 h
    // after their TTL epoch in rare cases)
    const nowEpoch = Math.floor(Date.now() / 1000);
    if (item.ttl && item.ttl < nowEpoch) return null;

    return JSON.parse(item.responseBody);
  } catch (err) {
    console.warn('[SpoonacularCache] DynamoDB read error:', err.message);
    return null;
  }
}

async function writeCache(cacheKey, endpoint, responseBody, ttlSeconds = DEFAULT_TTL_SECONDS) {
  if (!TABLE) return;
  try {
    const ttlEpoch = Math.floor(Date.now() / 1000) + ttlSeconds;
    await dynamo.send(new PutCommand({
      TableName: TABLE,
      Item: {
        cacheKey,
        endpoint,
        responseBody: JSON.stringify(responseBody),
        ttl: ttlEpoch,
        cachedAt: new Date().toISOString(),
      },
    }));
    console.log(`[SpoonacularCache] STORED key=${cacheKey.slice(0,12)}… endpoint=${endpoint} ttl=${ttlSeconds}s`);
  } catch (err) {
    console.warn('[SpoonacularCache] DynamoDB write error:', err.message);
    // Non-fatal: the response was already returned to the client
  }
}

// ── Express route handler ─────────────────────────────────────────────────────

/**
 * POST /spoonacular
 *
 * Body:
 *   {
 *     endpoint: string,   // e.g. "/recipes/complexSearch"
 *     params:   object,   // query-string params WITHOUT apiKey (server adds it)
 *     ttl?:     number    // optional TTL override in seconds
 *   }
 *
 * Response: the raw Spoonacular JSON, either from cache or live.
 * Header `X-Cache` is set to "HIT" or "MISS" for observability.
 */
async function spoonacularProxyHandler(req, res) {
  const { endpoint, params = {}, ttl = DEFAULT_TTL_SECONDS } = req.body || {};

  if (!endpoint || typeof endpoint !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid "endpoint" field.' });
  }

  // Only allow absolute paths — prevents open-proxy abuse
  if (!endpoint.startsWith('/')) {
    return res.status(400).json({ error: '"endpoint" must be a path starting with "/".' });
  }

  // Strip any client-supplied apiKey — we inject our server-side key
  const safeParams = Object.assign({}, params);
  delete safeParams.apiKey;

  const cacheKey = buildCacheKey(endpoint, safeParams);

  // ── 1. Cache lookup ──────────────────────────────────────────────────────
  const cached = await readCache(cacheKey);
  if (cached !== null) {
    console.log(`[SpoonacularCache] HIT  key=${cacheKey.slice(0,12)}… endpoint=${endpoint}`);
    res.setHeader('X-Cache', 'HIT');
    return res.json(cached);
  }

  // ── 2. Cache miss — call Spoonacular ────────────────────────────────────
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server API key not configured.' });
  }

  const queryString = new URLSearchParams({ ...safeParams, apiKey }).toString();
  const fullUrl     = `${SPOONACULAR_BASE}${endpoint}?${queryString}`;

  console.log(`[SpoonacularCache] MISS key=${cacheKey.slice(0,12)}… endpoint=${endpoint} — fetching live`);

  try {
    const { status, data } = await httpsGet(fullUrl);

    if (status !== 200) {
      // Pass Spoonacular errors through without caching
      return res.status(status).json(data);
    }

    // ── 3. Store in DynamoDB (fire-and-forget — don't block the response) ─
    writeCache(cacheKey, endpoint, data, ttl).catch(() => {});

    res.setHeader('X-Cache', 'MISS');
    return res.json(data);
  } catch (err) {
    console.error('[SpoonacularCache] Fetch error:', err.message);
    return res.status(502).json({ error: 'Failed to reach Spoonacular API.', detail: err.message });
  }
}

module.exports = { spoonacularProxyHandler };
