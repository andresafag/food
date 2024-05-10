mongoose = require("./db_connection").mongoose

const schemaTechniques = new mongoose.Schema({
     name: String,
     description: String
});

const schemaFunFacts = new mongoose.Schema({
    food_funfact: String,
    description: String
});


const cookingTechniques = mongoose.model('cookingTechniques', schemaTechniques);
const food_funfacts = mongoose.model('food_funfacts', schemaFunFacts);

exports.cookingTechniques = cookingTechniques
exports.food_funfacts = food_funfacts