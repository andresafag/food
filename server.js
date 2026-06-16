let express = require('express'),
    app = express(),
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
  .get('/mealplan', function(req, res){
    res.render("mealplanner", {apiKey:apiKey})
  })
  .get('/random', function(req, res){
    res.render("randomrecipe", {apiKey:apiKey})
  })
  .get('/menu', function(req, res){
    res.render("menu", {apiKey:apiKey})
  })
  .get('/planner', function(req, res){
    res.render("plan", {apiKey:apiKey})
  })
  .get('/wine-pairs', function(req, res){
    res.render("wine-pairs", {apiKey:apiKey})
  })


app.use(router)
app.listen(app.get('port'), function(){
    console.log("Connecting to port: ", app.get('port'))
  });
