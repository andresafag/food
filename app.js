let express = require('express'),
    app = express(),
    bodyParser = require('body-parser'),
    router = express.Router(),
    path = require('path');

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.set('port', process.env.PORT || 3000);
app.use(express.static(path.join(__dirname, 'public')));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug')
if (process.env.NODE_ENV !== 'production') {
  app.disable('view cache');
}

require('dotenv').config()

const apiKey = process.env.SPOONACULAR_API_KEY || process.env.API_KEY;
const deepseekApiKey = process.env.DEEPSEEK_API_KEY || '';
const deepseekEndpoint = process.env.DEEPSEEK_ENDPOINT || '';

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
    res.render("ingredients", {apiKey:apiKey, deepseekAvailable: !!(deepseekApiKey && deepseekEndpoint)})
  })

  .post('/deepseek', async function(req, res){
    // Server-side proxy to call DeepSeek (keeps API key secret)
    if(!deepseekApiKey || !deepseekEndpoint){
      return res.status(501).json({ error: 'DeepSeek not configured' });
    }

    try{
      const payload = req.body || {};
      const resp = await fetch(deepseekEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${deepseekApiKey}`
        },
        body: JSON.stringify(payload)
      });

      const text = await resp.text();
      // Try to parse JSON, else return text
      try{ return res.status(resp.status).json(JSON.parse(text)); }catch(e){ return res.status(resp.status).send(text); }
    }catch(err){
      console.error('DeepSeek proxy error', err);
      return res.status(500).json({ error: err.message });
    }
  })


app.use(router)

module.exports = app;

