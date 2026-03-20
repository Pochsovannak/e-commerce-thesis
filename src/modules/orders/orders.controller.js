const mongoose = require("mongoose");
const { Order } = require("./orders.model");
const { OrderItem } = require("./order-item.model");
const { Cart } = require("../cart/cart.model");
const { CartItem } = require("../cart/cart-item.model");
const { Variant } = require("../products/varaints.model");
const { Product } = require("../products/products.model");
const { Payment } = require("../payments/payments.model");
const { BakongPayment } = require("../payments/bakong.model");
const bakongService = require("../payments/bakong.service");

const ensureValidObjectId = (value, fieldName) => {
  if (!mongoose.isValidObjectId(value)) {
    const error = new Error(`${fieldName} is invalid`);
    error.statusCode = 400;
    throw error;
  }
};

const sendKnownError = (res, error) =>
  res.status(error.statusCode || 400).json({ error: error.message });

const generateOrderNumber = () =>
  `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

const serializeOrderBundle = async (order) => {
  const [items, payment] = await Promise.all([
    OrderItem.find({ order: order._id }).sort({ createdAt: 1 }),
    Payment.findOne({ order: order._id }).sort({ createdAt: -1 }),
  ]);

  let bakong = null;
  if (payment) {
    bakong = await BakongPayment.findOne({ payment: payment._id });
  }

  return {
    order: order.toJSON(),
    items: items.map((item) => item.toJSON()),
    payment: payment ? payment.toJSON() : null,
    bakong: bakong ? bakong.toJSON() : null,
  };
};

const buildOrderFromCart = async (userId, payload) => {
  const cart = await Cart.findOne({ user: userId });
  if (!cart) {
    const error = new Error("Cart not found");
    error.statusCode = 404;
    throw error;
  }

  const cartItems = await CartItem.find({ cart: cart._id }).sort({ createdAt: 1 });
  if (!cartItems.length) {
    const error = new Error("Cart is empty");
    error.statusCode = 400;
    throw error;
  }

  const variantIds = cartItems.map((item) => item.variant);
  const variants = await Variant.find({ _id: { $in: variantIds } });
  const variantsById = variants.reduce((acc, variant) => {
    acc[variant._id.toString()] = variant;
    return acc;
  }, {});

  const productIds = variants.map((variant) => variant.productId);
  const products = await Product.find({ _id: { $in: productIds } });
  const productsById = products.reduce((acc, product) => {
    acc[product._id.toString()] = product;
    return acc;
  }, {});

  const orderItemsPayload = cartItems.map((item) => {
    const variant = variantsById[item.variant.toString()];
    if (!variant) {
      const error = new Error("One or more cart variants no longer exist");
      error.statusCode = 404;
      throw error;
    }

    const product = productsById[variant.productId.toString()];
    if (!product || !product.isPublished) {
      const error = new Error(`Product for variant ${variant.name} is not available`);
      error.statusCode = 400;
      throw error;
    }

    if (variant.stock < item.quantity) {
      const error = new Error(`Only ${variant.stock} item(s) available for ${variant.name}`);
      error.statusCode = 400;
      throw error;
    }

    const unitPrice = variant.price;
    return {
      variant: variant._id,
      productName: product.name,
      variantLabel: variant.name,
      quantity: item.quantity,
      unitPrice,
      totalPrice: unitPrice * item.quantity,
    };
  });

  const subtotal = orderItemsPayload.reduce((sum, item) => sum + item.totalPrice, 0);
  const shippingFee = typeof payload.shippingFee === "number" && payload.shippingFee >= 0
    ? payload.shippingFee
    : 0;
  const discountAmount = typeof payload.discountAmount === "number" && payload.discountAmount >= 0
    ? payload.discountAmount
    : cart.discount || 0;
  const totalAmount = Math.max(subtotal + shippingFee - discountAmount, 0);

  if (!payload.shippingAddress?.fullName ||
      !payload.shippingAddress?.phoneNumber ||
      !payload.shippingAddress?.addressLine1 ||
      !payload.shippingAddress?.city ||
      !payload.shippingAddress?.province ||
      !payload.shippingAddress?.country) {
    const error = new Error("Shipping address is incomplete");
    error.statusCode = 400;
    throw error;
  }

  return {
    cart,
    orderItemsPayload,
    subtotal,
    shippingFee,
    discountAmount,
    totalAmount,
  };
};

exports.createOrderFromCart = async (req, res) => {
  let checkout;
  try {
    checkout = await buildOrderFromCart(req.userId, req.body);
  } catch (error) {
    return sendKnownError(res, error);
  }

  const currency = req.body.currency === "KHR" ? "KHR" : "USD";
  const method = req.body.method === "bakong_khqr" ? "bakong_khqr" : "bakong_khqr";

  const order = await Order.create({
    user: req.userId,
    orderNumber: generateOrderNumber(),
    status: "pending_payment",
    subtotal: checkout.subtotal,
    shippingFee: checkout.shippingFee,
    discountAmount: checkout.discountAmount,
    totalAmount: checkout.totalAmount,
    currency,
    shippingAddress: req.body.shippingAddress,
    note: req.body.note ? String(req.body.note).trim() : null,
  });

  await OrderItem.insertMany(
    checkout.orderItemsPayload.map((item) => ({
      ...item,
      order: order._id,
    }))
  );

  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  const payment = await Payment.create({
    order: order._id,
    user: req.userId,
    amount: order.totalAmount,
    currency,
    method,
    expiresAt,
    status: "pending",
    isPaid: false,
  });

  let khqr;
  try {
    khqr = await bakongService.generateQrCode({
      amount: payment.amount,
      currency: payment.currency,
      billNumber: order.orderNumber,
    });
  } catch (error) {
    await Payment.deleteOne({ _id: payment._id });
    await OrderItem.deleteMany({ order: order._id });
    await Order.deleteOne({ _id: order._id });
    return res.status(502).json({ error: error.message || "Failed to initialize Bakong payment" });
  }

  const qrData = khqr?.data || khqr;
  const bakongPayment = await BakongPayment.create({
    payment: payment._id,
    merchantId: req.body.merchantId || null,
    merchantName: qrData?.merchantName || null,
    merchantCity: qrData?.merchantCity || null,
    qrString: qrData?.qr || qrData?.qrString || null,
    md5: qrData?.md5 || null,
    bakongHash: qrData?.bakongHash || null,
    fromAccountId: null,
    toAccountId: qrData?.accountInformation || null,
    description: order.orderNumber,
    externalRef: order.orderNumber,
    transactionId: null,
    receiverBank: null,
    receiverBankAccount: null,
    instructionRef: null,
    deepLink: qrData?.deeplink || qrData?.deepLink || null,
    shortLink: qrData?.shortLink || null,
  });

  const bundle = await serializeOrderBundle(order);
  return res.status(201).json({
    message: "Order created successfully",
    ...bundle,
    payment: payment.toJSON(),
    bakong: bakongPayment.toJSON(),
  });
};

exports.listMyOrders = async (req, res) => {
  const orders = await Order.find({ user: req.userId }).sort({ createdAt: -1 });
  return res.json({ orders });
};

exports.adminListOrders = async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, parseInt(req.query.limit, 10) || 20);
  const skip = (page - 1) * limit;
  const filter = {};

  if (req.query.status) {
    filter.status = req.query.status;
  }

  if (req.query.search) {
    const regex = new RegExp(req.query.search, "i");
    filter.$or = [{ orderNumber: regex }, { "shippingAddress.fullName": regex }];
  }

  const [orders, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Order.countDocuments(filter),
  ]);

  return res.json({
    orders,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
  });
};

exports.getMyOrder = async (req, res) => {
  try {
    ensureValidObjectId(req.params.id, "Order id");
  } catch (error) {
    return sendKnownError(res, error);
  }

  const order = await Order.findOne({ _id: req.params.id, user: req.userId });
  if (!order) {
    return res.status(404).json({ error: "Order not found" });
  }

  return res.json(await serializeOrderBundle(order));
};
