/**
 * spoonacular.js  —  client-side helper (public/spoonacular.js)
 *
 * Replaces direct browser → Spoonacular calls with a server proxy call to
 * POST /spoonacular, which checks DynamoDB before calling the real API.
 *
 * Usage:
 *   const data = await spoonacularFetch('/recipes/complexSearch', { query: 'pasta', number: 10 });
 *
 * The apiKey is no longer needed in the browser and should NOT be passed
 * as a param here — the server injects it.
 */
async function spoonacularFetch(endpoint, params = {}, ttl = 3600) {
  const response = await fetch('/spoonacular', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint, params, ttl }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(err.error || `Spoonacular proxy error: ${response.status}`);
  }

  return response.json();
}
