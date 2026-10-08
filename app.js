let express = require('express'),
    app = express(),
    bodyParser = require('body-parser'),
    router = express.Router(),
    path = require('path'),
    ai_feature = require("./ai_feature"),
    { spoonacularProxyHandler } = require("./spoonacular-cache");

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.set('port', process.env.PORT || 3000);
app.use(express.static(path.join(__dirname, 'public')));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug')
app.disable('view cache');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

require('dotenv').config()
const apiKey = process.env.API_KEY

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
  .get('/ingredients', function(req, res){
    res.render("ingredients", {apiKey:apiKey})
  })
  .post('/ai-route', async (req, res) => {
  try {
    const { noteText } = req.body || {};
    console.log("Received note text:", noteText);

    if (!noteText) {
      return res.status(400).json({ error: "Missing noteText field" });
    }

    const result = await ai_feature.ejecutarAnalisisEstrategico(noteText);
    return res.json({ message: 'Note received and processed successfully', result });
  } catch (error) {
    console.error('Error executing strategic analysis:', error);

    return res.status(500).json({
      message: 'Error processing note',
      error: error.message || error
    });
  }
})
  // Spoonacular proxy — all client-side API calls go through here so the
  // server can intercept and cache responses in DynamoDB before calling
  // Spoonacular. The apiKey is never exposed to the browser.
  .post('/spoonacular', spoonacularProxyHandler);

app.use(router)
// app.listen(app.get('port'), function(){
//   console.log('Express server listening on port ' + app.get('port'));
// });
module.exports = app;

