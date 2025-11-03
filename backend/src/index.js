
require('dotenv').config();
const express = require('express');
const app = express();
app.use('/webhook', require('./routes/webhook'));
app.listen(5000, ()=>console.log('listening'));
const cors = require('cors'); app.use(cors({ origin: '*' }));
