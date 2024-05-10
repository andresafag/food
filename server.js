let express = require('express'),
    app = express(),
    { cookingTechniques,food_funfacts } = require("./dao_layer/models")
    bodyParser = require('body-parser'),
    router = express.Router()

app.use(bodyParser.urlencoded({ extended: true }));
app.set('port', process.env.port || 8000);
app.use(express.static('public'));
app.set('view engine', 'pug')
require('dotenv').config()

const apiKey = process.env.API_KEY;

router
  .get('/', function(req, res){
    res.render("index", {apiKey:apiKey})
  })
  .get('/facts', async function(req, res){
    let count = await food_funfacts.countDocuments()
    let random = Math.floor(Math.random() * count)
    let foodFacts = await food_funfacts.find().skip(random).limit(5).sort({description:-1})
     
    res.render("facts", {facts:foodFacts})
  })
  .get('/techniques', async function(req, res){
    let count = await cookingTechniques.countDocuments()
    let random = Math.floor(Math.random() * count)
    let techniques = await cookingTechniques.find().skip(random).limit(10).sort({description:-1})
    res.render("techniques", {techniques:techniques})
  })

app.use(router)
app.listen(app.get('port'), function(){
    console.log("Connecting to port: ", app.get('port'))
  });
