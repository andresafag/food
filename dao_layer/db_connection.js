const mongoose = require("mongoose")
mongoose.connect('mongodb://127.0.0.1:27017/food')
mongoose.connection.on('connected', err => {
  if(err) {logError(err)};
  console.log("we are connected")
});

exports.mongoose = mongoose;
