let express = require('express');
let app = express();
let bodyParser = require('body-parser');
app.use(bodyParser.urlencoded({ extended: true }));
app.set('port', process.env.port || 8000);
let router = express.Router();
app.use(express.static('public'));
app.set('view engine', 'pug')

router
  .get('/', function(req, res){
    res.render("index")
  })
 


app.use(router)
app.listen(app.get('port'), function(){
    console.log("Conectado al puerto: ", app.get('port'))
  });
