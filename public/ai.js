// Simple DeepSeek-style interpreter for Spoonacular "findByIngredients" responses.
// Exposes `window.deepseekInterpret(recipes)` which returns a human-readable string.

(function(){
  function formatIngredient(ing){
    if(!ing) return '';
    const amount = ing.amount || '';
    const unit = ing.unit || ing.unitShort || '';
    const name = ing.name || ing.original || '';
    return `${amount ? amount + ' ' : ''}${unit ? unit + ' ' : ''}${name}`.trim();
  }

  async function deepseekInterpret(recipes){
    // If DeepSeek is configured on the page, call the remote interpret endpoint.
    // Otherwise fall back to a local, deterministic formatter.
    // If the server-side proxy is available, call it. This keeps the DeepSeek API key secret.
    try{
      if(typeof window !== 'undefined' && window.deepseekAvailable){
        const payload = {
          instruction: `Write in human-friendly language the recipes returned by the Spoonacular "findByIngredients" endpoint. For each recipe include: title, which ingredients the user has, missing ingredients (with amounts when available), and a short, friendly suggestion. Keep it concise and conversational.`,
          data: { recipes }
        };

        const resp = await fetch('/deepseek', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if(resp.ok){
          const text = await resp.text();
          try{ return JSON.parse(text).output || JSON.parse(text).text || JSON.parse(text).result || text; }catch(e){ return text; }
        }
        console.warn('DeepSeek proxy returned', resp.status);
      }
    }catch(err){
      console.warn('DeepSeek proxy error, falling back to local formatting', err);
    }

    return localFormat(recipes);
  }

  function localFormat(recipes){
    // Return an array of per-recipe human-friendly summaries (no image URLs included)
    if(!recipes) return ['No recipes returned.'];
    if(!Array.isArray(recipes) || recipes.length === 0) return ['No recipes found for those ingredients.'];

    const summaries = [];
    summaries.push(`I found ${recipes.length} recipe${recipes.length>1 ? 's' : ''} that might work based on what you supplied:`);

    recipes.forEach((r, idx) => {
      const title = r.title || r.name || `Recipe ${idx+1}`;
      const lines = [];
      lines.push(`${idx+1}. ${title}`);

      if(Array.isArray(r.usedIngredients) && r.usedIngredients.length){
        const used = r.usedIngredients.map(u => u.name || formatIngredient(u)).join(', ');
        lines.push(`- You have: ${used}.`);
      }

      if(Array.isArray(r.missedIngredients) && r.missedIngredients.length){
        const missed = r.missedIngredients.map(m => {
          const name = m.name || m.originalName || '';
          const amt = (m.amount ? `${m.amount} ${m.unit || m.unitShort || ''}` : '').trim();
          return amt ? `${name} (${amt})` : name;
        }).join(', ');
        lines.push(`- Missing: ${missed}.`);
      } else {
        lines.push(`- You have everything needed for this one.`);
      }

      if(r.missedIngredientCount){
        lines.push(`- Quick note: this recipe misses ${r.missedIngredientCount} ingredient${r.missedIngredientCount>1 ? 's' : ''}.`);
      }

      // Do not include the image URL in the textual summary; the client will render images separately.

      summaries.push(lines.join('\n'));
    });

    summaries.push('If you want, paste more ingredients or adjust the list and I can search again.');
    return summaries;
  }

  // Expose globally
  window.deepseekInterpret = deepseekInterpret;
})();
