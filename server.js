let express = require('express'),
    app = express(),
    bodyParser = require('body-parser'),
    router = express.Router()

app.use(bodyParser.urlencoded({ extended: true }));
app.set('port', process.env.port || 8000);
app.use(express.static('public'));
app.set('view engine', 'pug')

router
  .get('/', function(req, res){
    res.render("index")
  })
 


app.use(router)
app.listen(app.get('port'), function(){
    console.log("Connecting to port: ", app.get('port'))
  });
