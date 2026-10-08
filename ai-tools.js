const tools = [
  {
    type: "function",
    function: {
      name: "getRecipes",
      description: " Search recipes by keyword or general filters. Useful for direct searches of dishes or specific recipes.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Main ingredient of the recipe in English (eg. 'pasta', 'chicken')."
          },
          number: {
            type: "integer",
            description: "Maximum number of results to return."
          },
          maxFat: {
            type: "number",
            description: "Maximum amount of fat in grams per serving."
          },
          minIron: {
            type: "number",
            description: "Minimum amount of iron in milligrams (mg) per serving."
          }
        },
        required: ["query"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "getIngredientSubstitutes",
      description: "Searches for substitutes for a specific ingredient. Useful for 'what can I replace butter with?'",
      parameters: {
        type: "object",
        properties: {
          ingredientName: {
            type: "string",
            description: "Name of the ingredient in English (eg. 'butter', 'sugar', 'flour')."
          }
        },
        required: ["ingredientName"]
      }
    }
  },

  // 3. Recetas similares
  {
    type: "function",
    function: {
      name: "getSimilarRecipes",
      description: "Searches for recipes similar to a given recipe by its ID. Useful for 'what recipe can replace this one?'",
      parameters: {
        type: "object",
        properties: {
          recipeId: {
            type: "integer",
            description: "Numeric ID of the source recipe."
          },
          number: {
            type: "integer",
            description: "Amount of similar recipes to return."
          }
        },
        required: ["recipeId"]
      }
    }
  },

  // 4. Búsqueda por rango de nutrientes
  {
    type: "function",
    function: {
      name: "searchRecipesByNutrients",
      description: "Searches for recipes based on nutritional content (fat, calories, protein, etc.). Useful for 'find low-fat recipes' or 'high-protein meals'.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Optional search term in English (eg. 'pasta', 'chicken')."
          },
          maxFat: {
            type: "number",
            description: "Maximum amount of fat in grams per serving."
          },
          minFat: {
            type: "number",
            description: "Minimum amount of fat in grams per serving."
          },
          maxCalories: {
            type: "number",
            description: "Maximum number of calories per serving."
          },
          minProtein: {
            type: "number",
            description: "Minimum amount of protein in grams per serving."
          },
          number: {
            type: "integer",
            description: "Maximum number of results to return."
          }
        },
        required: []
      }
    }
  },

  // 5. Nutrición por ID de receta
  {
    type: "function",
    function: {
      name: "getRecipeNutrition",
      description: "Retrieves the nutritional information of a recipe by its ID. Useful for 'give me the nutrition facts for this recipe'.",
      parameters: {
        type: "object",
        properties: {
          recipeId: {
            type: "integer",
            description: "Numeric ID of the recipe to retrieve nutrition information for."
          }
        },
        required: ["recipeId"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "guessNutritionByDishName",
      description: "Estimates the nutritional content of a dish based on its name. Useful for 'what are the nutrition facts for spaghetti carbonara?'.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Name of the dish or recipe in English (eg. 'Spaghetti Carbonara', 'Chicken Tikka Masala')."
          }
        },
        required: ["title"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "classifyCuisine",
      description: "Analyzes the title of a dish to determine its cuisine or cultural origin. Useful for 'where is this dish from?'",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Name of the dish or recipe in English (eg. 'Tacos', 'Paella', 'Pho')."
          }
        },
        required: ["title"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "findByIngredients",
      description: "Finds recipes based on a list of ingredients the user already has available.",
      parameters: {
        type: "object",
        properties: {
          ingredients: {
            type: "array",
            items: { type: "string" },
            description: "List of ingredients in English (eg. ['tomato', 'cheese', 'onion'])."
          },
          number: {
            type: "integer",
            description: "Maximum number of results to return."
          }
        },
        required: ["ingredients"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "searchRecipesByCuisine",
      description: "Finds recipes belonging to a specific cuisine or cultural background (e.g., 'Mexican', 'Italian', 'Asian').",
      parameters: {
        type: "object",
        properties: {
          cuisine: {
            type: "string",
            description: "Cuisine type in English (e.g., 'Italian', 'Mexican', 'Japanese', 'Mediterranean')."
          },
          query: {
            type: "string",
            description: "Optional search term in English."
          },
          number: {
            type: "integer",
            description: "Maximum number of results to return."
          }
        },
        required: ["cuisine"]
      }
    }
  }
];

module.exports = tools;