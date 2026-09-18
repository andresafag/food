let express = require('express'),
    app = express(),
    bodyParser = require('body-parser'),
    router = express.Router(),
    path = require('path');

app.use(bodyParser.urlencoded({ extended: true }));
app.set('port', process.env.PORT || 3000);
app.use(express.static(path.join(__dirname, 'public')));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug')
if (process.env.NODE_ENV !== 'production') {
  app.disable('view cache');
}

require('dotenv').config()

const apiKey = process.env.SPOONACULAR_API_KEY || process.env.API_KEY;

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

module.exports = app;

