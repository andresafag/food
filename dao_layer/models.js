mongoose = require("./db_connection").mongoose


const schema = new mongoose.Schema({
     name: String,
     description: String
    });

const cookingTechniques = mongoose.model('cookingTechniques', schema);



exports.cookingTechniques = cookingTechniques