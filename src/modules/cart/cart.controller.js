const mongoose = require("mongoose");
const { Cart } = require("./cart.model");
const { CartItem } = require("./cart-item.model");
const { Variant } = require("../products/varaints.model");
const { Product } = require("../products/products.model");

const ensureValidObjectId = (value, fieldName) => {
  if (!mongoose.isValidObjectId(value)) {
    const error = new Error(`${fieldName} is invalid`);
    error.statusCode = 400;
    throw error;
  }
};

const sendKnownError = (res, error) =>
  res.status(error.statusCode || 400).json({ error: error.message });

const normalizeDiscount = (value) => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || Number.isNaN(value) || value < 0) {
    const error = new Error("discount must be a non-negative number");
    error.statusCode = 400;
    throw error;
  }

  return value;
};

const buildCartSummary = async (cart) => {
  const items = await CartItem.find({ cart: cart._id }).sort({ createdAt: 1 });

  const variantIds = items.map((item) => item.variant);
  const variants = variantIds.length
    ? await Variant.find({ _id: { $in: variantIds } })
    : [];
  const variantsById = variants.reduce((acc, variant) => {
    acc[variant._id.toString()] = variant;
    return acc;
  }, {});

  const productIds = variants.map((variant) => variant.productId);
  const products = productIds.length
    ? await Product.find({ _id: { $in: productIds } })
    : [];
  const productsById = products.reduce((acc, product) => {
    acc[product._id.toString()] = product;
    return acc;
  }, {});

  const serializedItems = items.map((item) => {
    const variant = variantsById[item.variant.toString()] || null;
    const product = variant ? productsById[variant.productId.toString()] || null : null;
    const lineTotal = item.unitPrice * item.quantity;

    return {
      ...item.toJSON(),
      lineTotal,
      variant: variant ? variant.toJSON() : null,
      product: product ? product.toJSON() : null,
    };
  });

  const subtotal = serializedItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const discount = cart.discount || 0;

  return {
    cart: {
      ...cart.toJSON(),
      itemCount: serializedItems.reduce((sum, item) => sum + item.quantity, 0),
      subtotal,
      discount,
      total: Math.max(subtotal - discount, 0),
    },
    items: serializedItems,
  };
};

const findOrCreateCart = async (userId) => {
  let cart = await Cart.findOne({ user: userId });

  if (!cart) {
    cart = await Cart.create({ user: userId });
  }

  return cart;
};

const ensureVariantAvailable = async (variantId) => {
  const variant = await Variant.findById(variantId);

  if (!variant) {
    const error = new Error("Variant not found");
    error.statusCode = 404;
    throw error;
  }

  const product = await Product.findById(variant.productId);
  if (!product || !product.isPublished) {
    const error = new Error("Product is not available");
    error.statusCode = 404;
    throw error;
  }

  return { variant, product };
};

exports.getMyCart = async (req, res) => {
  const cart = await findOrCreateCart(req.userId);
  const summary = await buildCartSummary(cart);

  return res.json(summary);
};

exports.updateCartMeta = async (req, res) => {
  const cart = await findOrCreateCart(req.userId);

  try {
    const discount = normalizeDiscount(req.body.discount);
    if (req.body.coupon !== undefined) {
      cart.coupon = req.body.coupon ? String(req.body.coupon).trim() : null;
    }
    if (discount !== undefined) {
      cart.discount = discount;
    }
  } catch (error) {
    return sendKnownError(res, error);
  }

  await cart.save();

  const summary = await buildCartSummary(cart);
  return res.json({
    message: "Cart updated successfully",
    ...summary,
  });
};

exports.addCartItem = async (req, res) => {
  const { variantId, quantity } = req.body;

  if (!variantId) {
    return res.status(400).json({ error: "variantId is required" });
  }

  if (quantity === undefined || !Number.isInteger(quantity) || quantity < 1) {
    return res.status(400).json({ error: "quantity must be an integer greater than 0" });
  }

  try {
    ensureValidObjectId(variantId, "Variant id");
  } catch (error) {
    return sendKnownError(res, error);
  }

  let variant;
  try {
    ({ variant } = await ensureVariantAvailable(variantId));
  } catch (error) {
    return sendKnownError(res, error);
  }

  const cart = await findOrCreateCart(req.userId);
  let item = await CartItem.findOne({ cart: cart._id, variant: variant._id });
  const nextQuantity = (item?.quantity || 0) + quantity;

  if (nextQuantity > variant.stock) {
    return res.status(400).json({
      error: `Only ${variant.stock} item(s) are available in stock`,
    });
  }

  if (item) {
    item.quantity = nextQuantity;
    item.unitPrice = variant.price;
    await item.save();
  } else {
    item = await CartItem.create({
      cart: cart._id,
      variant: variant._id,
      quantity,
      unitPrice: variant.price,
    });
  }

  const summary = await buildCartSummary(cart);
  return res.status(201).json({
    message: "Item added to cart successfully",
    item: item.toJSON(),
    ...summary,
  });
};

exports.updateCartItem = async (req, res) => {
  const { quantity } = req.body;

  if (quantity === undefined || !Number.isInteger(quantity) || quantity < 1) {
    return res.status(400).json({ error: "quantity must be an integer greater than 0" });
  }

  try {
    ensureValidObjectId(req.params.itemId, "Cart item id");
  } catch (error) {
    return sendKnownError(res, error);
  }

  const cart = await findOrCreateCart(req.userId);
  const item = await CartItem.findOne({ _id: req.params.itemId, cart: cart._id });

  if (!item) {
    return res.status(404).json({ error: "Cart item not found" });
  }

  let variant;
  try {
    ({ variant } = await ensureVariantAvailable(item.variant));
  } catch (error) {
    return sendKnownError(res, error);
  }

  if (quantity > variant.stock) {
    return res.status(400).json({
      error: `Only ${variant.stock} item(s) are available in stock`,
    });
  }

  item.quantity = quantity;
  item.unitPrice = variant.price;
  await item.save();

  const summary = await buildCartSummary(cart);
  return res.json({
    message: "Cart item updated successfully",
    item: item.toJSON(),
    ...summary,
  });
};

exports.removeCartItem = async (req, res) => {
  try {
    ensureValidObjectId(req.params.itemId, "Cart item id");
  } catch (error) {
    return sendKnownError(res, error);
  }

  const cart = await findOrCreateCart(req.userId);
  const item = await CartItem.findOne({ _id: req.params.itemId, cart: cart._id });

  if (!item) {
    return res.status(404).json({ error: "Cart item not found" });
  }

  await item.deleteOne();

  const summary = await buildCartSummary(cart);
  return res.json({
    message: "Cart item removed successfully",
    ...summary,
  });
};

exports.clearMyCart = async (req, res) => {
  const cart = await findOrCreateCart(req.userId);
  await CartItem.deleteMany({ cart: cart._id });

  const summary = await buildCartSummary(cart);
  return res.json({
    message: "Cart cleared successfully",
    ...summary,
  });
};
