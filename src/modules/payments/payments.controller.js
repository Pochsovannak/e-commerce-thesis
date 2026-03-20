const mongoose = require("mongoose");
const { Payment } = require("./payments.model");
const { BakongPayment } = require("./bakong.model");
const { Order } = require("../orders/orders.model");
const { OrderItem } = require("../orders/order-item.model");
const { Cart } = require("../cart/cart.model");
const { CartItem } = require("../cart/cart-item.model");
const { Variant } = require("../products/varaints.model");
const bakongService = require("./bakong.service");

const ensureValidObjectId = (value, fieldName) => {
  if (!mongoose.isValidObjectId(value)) {
    const error = new Error(`${fieldName} is invalid`);
    error.statusCode = 400;
    throw error;
  }
};

const sendKnownError = (res, error) =>
  res.status(error.statusCode || 400).json({ error: error.message });

const serializePaymentBundle = async (payment) => {
  const [order, bakong] = await Promise.all([
    Order.findById(payment.order),
    BakongPayment.findOne({ payment: payment._id }),
  ]);

  return {
    payment: payment.toJSON(),
    order: order ? order.toJSON() : null,
    bakong: bakong ? bakong.toJSON() : null,
  };
};

exports.adminListPayments = async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, parseInt(req.query.limit, 10) || 20);
  const skip = (page - 1) * limit;
  const filter = {};

  if (req.query.status) {
    filter.status = req.query.status;
  }

  if (req.query.method) {
    filter.method = req.query.method;
  }

  const [payments, total] = await Promise.all([
    Payment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Payment.countDocuments(filter),
  ]);

  return res.json({
    payments,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
  });
};

const markOrderPaid = async (payment, bakongPayment, transaction) => {
  if (payment.isPaid) {
    return;
  }

  const order = await Order.findById(payment.order).session(transaction);
  if (!order) {
    throw new Error("Order not found");
  }

  const orderItems = await OrderItem.find({ order: order._id }).session(transaction);

  for (const item of orderItems) {
    const variant = await Variant.findById(item.variant).session(transaction);
    if (!variant) {
      throw new Error(`Variant ${item.variant} not found during payment settlement`);
    }
    if (variant.stock < item.quantity) {
      throw new Error(`Insufficient stock for ${item.variantLabel}`);
    }

    variant.stock -= item.quantity;
    await variant.save({ session: transaction });
  }

  payment.status = "paid";
  payment.isPaid = true;
  payment.paidAt = payment.paidAt || new Date();
  payment.failReason = null;
  await payment.save({ session: transaction });

  order.status = "paid";
  order.paidAt = payment.paidAt;
  await order.save({ session: transaction });

  const cart = await Cart.findOne({ user: payment.user }).session(transaction);
  if (cart) {
    await CartItem.deleteMany({ cart: cart._id }).session(transaction);
    cart.coupon = null;
    cart.discount = 0;
    await cart.save({ session: transaction });
  }

  if (bakongPayment) {
    await bakongPayment.save({ session: transaction });
  }
};

exports.getPayment = async (req, res) => {
  try {
    ensureValidObjectId(req.params.id, "Payment id");
  } catch (error) {
    return sendKnownError(res, error);
  }

  const payment = await Payment.findOne({ _id: req.params.id, user: req.userId });
  if (!payment) {
    return res.status(404).json({ error: "Payment not found" });
  }

  return res.json(await serializePaymentBundle(payment));
};

exports.checkBakongPaymentStatus = async (req, res) => {
  try {
    ensureValidObjectId(req.params.id, "Payment id");
  } catch (error) {
    return sendKnownError(res, error);
  }

  const payment = await Payment.findOne({ _id: req.params.id, user: req.userId });
  if (!payment) {
    return res.status(404).json({ error: "Payment not found" });
  }

  const bakongPayment = await BakongPayment.findOne({ payment: payment._id });
  if (!bakongPayment) {
    return res.status(404).json({ error: "Bakong payment details not found" });
  }

  if (payment.isPaid) {
    return res.json({
      message: "Payment already confirmed",
      ...(await serializePaymentBundle(payment)),
    });
  }

  if (payment.expiresAt < new Date()) {
    payment.status = "expired";
    payment.failReason = "Payment expired before confirmation";
    await payment.save();

    const order = await Order.findById(payment.order);
    if (order && order.status === "pending_payment") {
      order.status = "failed";
      await order.save();
    }

    return res.json({
      message: "Payment has expired",
      ...(await serializePaymentBundle(payment)),
    });
  }

  let statusResponse;
  try {
    statusResponse = await bakongService.checkTransactionStatus(bakongPayment.md5);
  } catch (error) {
    return res.status(502).json({ error: error.message || "Failed to check Bakong payment status" });
  }

  const bakongData = statusResponse?.data || statusResponse?.response?.data || null;
  const statusText = String(
    statusResponse?.responseMessage ||
      statusResponse?.response?.responseMessage ||
    bakongData?.status ||
      bakongData?.transactionStatus ||
      bakongData?.responseMessage ||
      ""
  ).toLowerCase();

  const successful =
    statusResponse?.responseCode === 0 ||
    statusResponse?.response?.responseCode === 0 ||
    statusText.includes("success") ||
    statusText.includes("completed") ||
    statusText.includes("paid") ||
    Boolean(bakongData?.hash && bakongData?.externalRef) ||
    Boolean(bakongData?.acknowledgedDateMs) ||
    bakongData?.isPaid === true;

  if (successful) {
    bakongPayment.transactionId =
      bakongData?.transactionId ||
      bakongData?.transaction_id ||
      bakongData?.externalRef ||
      bakongPayment.transactionId;
    bakongPayment.bakongHash = bakongData?.hash || bakongPayment.bakongHash;
    bakongPayment.fromAccountId =
      bakongData?.fromAccountId ||
      bakongData?.fromAccount ||
      bakongPayment.fromAccountId;
    bakongPayment.toAccountId =
      bakongData?.toAccountId ||
      bakongPayment.toAccountId;
    bakongPayment.description =
      bakongData?.description ??
      bakongPayment.description;
    bakongPayment.receiverBank =
      bakongData?.receiverBank ||
      bakongData?.recevierBank ||
      bakongPayment.receiverBank;
    bakongPayment.receiverBankAccount =
      bakongData?.receiverBankAccount ||
      bakongData?.recevierBankAccount ||
      bakongPayment.receiverBankAccount;
    bakongPayment.instructionRef =
      bakongData?.instructionRef || bakongPayment.instructionRef;

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        if (bakongData?.acknowledgedDateMs && !payment.paidAt) {
          payment.paidAt = new Date(bakongData.acknowledgedDateMs);
        }
        await markOrderPaid(payment, bakongPayment, session);
      });
    } finally {
      await session.endSession();
    }

    return res.json({
      message: "Payment confirmed successfully",
      ...(await serializePaymentBundle(payment)),
    });
  }

  return res.json({
    message: "Payment is still pending",
    ...(await serializePaymentBundle(payment)),
    bakongStatus: bakongData,
  });
};
