const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const { config } = require('./config/env');
const connectMongoDB = require('./database/connection');
const catchError = require('./middleware/catch-error');
const app = express();

// app.use(morgan('combined'));
app.use(cookieParser());
app.use(helmet());
app.use(cors({
  origin: config.cors.origin,
  methods: config.cors.methods,
  allowedHeaders: config.cors.allowedHeaders,
  credentials: true
}));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/api/v1/users', require('./modules/users/users.route'))
app.use('/api/v1/auth', require('./modules/auth/auth.route'))
app.use('/api/v1/categories', require('./modules/categoies/categoies.route'))
app.use('/api/v1/categoies', require('./modules/categoies/categoies.route'))
app.use('/api/v1/products', require('./modules/products/products.route'))
app.use('/api/v1/cart', require('./modules/cart/cart.route'))
app.use('/api/v1/orders', require('./modules/orders/orders.route'))
app.use('/api/v1/payments', require('./modules/payments/payments.route'))
app.use('/api/v1/storage', require('./modules/storage/storage.route'))
app.use(require('./modules/health/health.route'))
app.use(catchError)

app.listen(config.port, async () => {
  await connectMongoDB()
  console.log(`App listening at http://localhost:${config.port}`);
});
