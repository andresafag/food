const BASE_URL = 'https://api.spoonacular.com';
const API_KEY = "3b2bf88a8a9441b6adc87e68c13407be"
const axios = require('axios');

const client = axios.create({
  baseURL: BASE_URL,
  params: { apiKey: API_KEY }
});

const functionsRegistry = {
  async getRecipes(args) {
    try {
      const res = await client.get('/recipes/complexSearch', { params: { ...args } });
      return res.data.results.map(recipe => ({
        id: recipe.id,
        title: recipe.title,
        image: recipe.image,
      }));
    } catch (error) {
      console.error(`Error en getRecipes:`, error.message);
      return { error: `No recipes found for the provided parameters.` };
    }
  },

  async getIngredientSubstitutes({ ingredientName }) {
    try {
      const res = await client.get('/food/ingredients/substitutes', { params: { ingredientName } });
      return res.data;
    } catch (error) {
      console.error(`Error en getIngredientSubstitutes:`, error.message);
      return { error: `Could not find substitutes for '${ingredientName}'.` };
    }
  },

  async getSimilarRecipes({ recipeId, number = 3 }) {
    try {
      const res = await client.get(`/recipes/${recipeId}/similar`, { params: { number } });
      return res.data;
    } catch (error) {
      console.error(`Error en getSimilarRecipes:`, error.message);
      return { error: `Could not find similar recipes for ID ${recipeId}.` };
    }
  },

  async searchRecipesByNutrients(params) {
    try {
      const res = await client.get('/recipes/complexSearch', {
        params: { ...params, addRecipeNutrition: true }
      });
      return res.data.results;
    } catch (error) {
      console.error('Error en searchRecipesByNutrients:', error.message);
      return { error: 'Failed to search recipes by nutrients.' };
    }
  },

  async getRecipeNutrition({ recipeId }) {
    try {
      const res = await client.get(`/recipes/${recipeId}/nutritionWidget.json`);
      return res.data;
    } catch (error) {
      console.error(`Error en getRecipeNutrition:`, error.message);
      return { error: `Could not retrieve nutrition for recipe ID ${recipeId}.` };
    }
  },

  async guessNutritionByDishName({ title }) {
    try {
      const res = await client.get('/recipes/guessNutrition', { params: { title } });
      return res.data;
    } catch (error) {
      console.error(`Error en guessNutritionByDishName:`, error.message);
      return { error: `Could not guess nutrition for dish '${title}'.` };
    }
  },

  async classifyCuisine({ title }) {
    try {
      const params = new URLSearchParams();
      params.append('title', title);

      const res = await client.post('/recipes/cuisine', params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      return res.data;
    } catch (error) {
      console.error(`Error en classifyCuisine:`, error.message);
      return { error: `Could not classify cuisine for '${title}'.` };
    }
  },

  async findByIngredients({ ingredients, number = 5 }) {
    try {
      const ingredientList = Array.isArray(ingredients) ? ingredients.join(',') : ingredients;
      const res = await client.get('/recipes/findByIngredients', {
        params: { ingredients: ingredientList, number }
      });
      return res.data;
    } catch (error) {
      console.error('Error en findByIngredients:', error.message);
      return { error: 'Failed to find recipes by ingredients.' };
    }
  },

  async searchRecipesByCuisine({ cuisine, query, number = 5 }) {
    try {
      const res = await client.get('/recipes/complexSearch', {
        params: { cuisine, query, number }
      });
      return res.data.results;
    } catch (error) {
      console.error(`Error en searchRecipesByCuisine:`, error.message);
      return { error: `Failed to search recipes for cuisine '${cuisine}'.` };
    }
  }
};

module.exports = functionsRegistry;