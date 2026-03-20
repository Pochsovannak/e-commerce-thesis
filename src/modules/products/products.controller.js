const mongoose = require("mongoose");
const Roles = require("../../constants/Roles");
const {
  PRODUCT_CATEGORY_POPULATE,
  buildProductCategoryPayload,
  normalizeNullableObjectId,
  serializeProductCategories,
} = require("../categoies/categoies.service");
const { removeFilesFromStorage } = require("../storage/storage.service");
const { Product } = require("./products.model");
const { Variant } = require("./varaints.model");

const MAX_LIMIT = 100;

const slugify = (value = "") =>
  value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const isAdmin = (req) =>
  [Roles.ADMIN, Roles.SUPER_ADMIN, Roles.MODERATOR].includes(req.user?.role);

const parseBoolean = (value) => {
  if (value === true || value === false) return value;
  if (typeof value !== "string") return undefined;
  if (value.toLowerCase() === "true") return true;
  if (value.toLowerCase() === "false") return false;
  return undefined;
};

const normalizeImages = (images) => {
  if (images === undefined) return undefined;
  if (!Array.isArray(images)) return null;

  return images.map((image) => ({
    key: image?.key,
    url: image?.url,
    name: image?.name,
    size: image?.size,
    mimeType: image?.mimeType,
  }));
};

const sendKnownError = (res, error) =>
  res.status(error.statusCode || 400).json({ error: error.message });

const ensureValidObjectId = (value, fieldName) => {
  if (!mongoose.isValidObjectId(value)) {
    const error = new Error(`${fieldName} is invalid`);
    error.statusCode = 400;
    throw error;
  }
};

const serializeProduct = (product, variants) => {
  const serializedProduct = serializeProductCategories(product);

  if (variants !== undefined) {
    serializedProduct.variants = variants.map((variant) =>
      typeof variant?.toJSON === "function" ? variant.toJSON() : variant
    );
  }

  return serializedProduct;
};

const buildProductPayload = async (payload, currentProduct) => {
  const data = {};

  if (payload.name !== undefined) data.name = payload.name;
  if (payload.description !== undefined) data.description = payload.description;
  if (payload.basePrice !== undefined) data.basePrice = payload.basePrice;
  if (payload.discount !== undefined) data.discount = payload.discount;

  const publishedValue = parseBoolean(payload.isPublished);
  if (payload.isPublished !== undefined && publishedValue === undefined) {
    const error = new Error("isPublished must be a boolean");
    error.statusCode = 400;
    throw error;
  }
  if (publishedValue !== undefined) data.isPublished = publishedValue;

  const normalizedImages = normalizeImages(payload.images);
  if (payload.images !== undefined && normalizedImages === null) {
    const error = new Error("images must be an array");
    error.statusCode = 400;
    throw error;
  }
  if (normalizedImages !== undefined) data.images = normalizedImages;

  const nextName = data.name ?? currentProduct?.name ?? payload.name;
  const shouldUpdateSlug =
    !currentProduct || payload.slug !== undefined || payload.name !== undefined;
  const nextSlugInput = shouldUpdateSlug
    ? payload.slug !== undefined
      ? payload.slug
      : nextName
    : undefined;
  if (nextSlugInput !== undefined) {
    const slug = slugify(nextSlugInput);
    if (!slug) {
      const error = new Error("slug is required");
      error.statusCode = 400;
      throw error;
    }

    const existingProduct = await Product.findOne({
      slug,
      ...(currentProduct ? { _id: { $ne: currentProduct._id } } : {}),
    });

    if (existingProduct) {
      const error = new Error("Product slug already exists");
      error.statusCode = 409;
      throw error;
    }

    data.slug = slug;
  }

  return data;
};
const normalizeVariantAttributes = (attributes) => {
  if (attributes === undefined) return undefined;
  if (!attributes || Array.isArray(attributes) || typeof attributes !== "object") {
    return null;
  }

  return Object.entries(attributes).reduce((acc, [key, value]) => {
    if (value !== undefined && value !== null) {
      acc[key] = String(value);
    }
    return acc;
  }, {});
};

const buildVariantPayload = (payload) => {
  const data = {};

  if (payload.name !== undefined) data.name = payload.name;
  if (payload.price !== undefined) data.price = payload.price;
  if (payload.stock !== undefined) data.stock = payload.stock;

  const attributes = normalizeVariantAttributes(payload.attributes);
  if (payload.attributes !== undefined && attributes === null) {
    const error = new Error("attributes must be an object");
    error.statusCode = 400;
    throw error;
  }
  if (attributes !== undefined) data.attributes = attributes;

  return data;
};

const findProductByParam = async (value) => {
  if (mongoose.isValidObjectId(value)) {
    const productById = await Product.findById(value).populate(PRODUCT_CATEGORY_POPULATE);
    if (productById) return productById;
  }

  return Product.findOne({ slug: value }).populate(PRODUCT_CATEGORY_POPULATE);
};

exports.createProduct = async (req, res) => {
  const { variants = [], ...productPayload } = req.body;

  if (!productPayload.name || !productPayload.description || productPayload.basePrice === undefined) {
    return res.status(400).json({
      error: "name, description, and basePrice are required",
    });
  }

  if (variants !== undefined && !Array.isArray(variants)) {
    return res.status(400).json({ error: "variants must be an array" });
  }

  let data;
  try {
    const productData = await buildProductPayload(productPayload);
    const categoryData = await buildProductCategoryPayload(productPayload);
    data = { ...productData, ...categoryData };
  } catch (error) {
    return sendKnownError(res, error);
  }

  const product = await Product.create(data);

  let createdVariants = [];
  if (variants.length > 0) {
    let variantPayloads;
    try {
      variantPayloads = variants.map((variant) => ({
        ...buildVariantPayload(variant),
        productId: product._id,
      }));
    } catch (error) {
      await product.deleteOne();
      return sendKnownError(res, error);
    }

    createdVariants = await Variant.insertMany(variantPayloads, { ordered: true });
  }

  const populatedProduct = await Product.findById(product._id).populate(PRODUCT_CATEGORY_POPULATE);

  return res.status(201).json({
    message: "Product created successfully",
    product: serializeProduct(populatedProduct || product),
    variants: createdVariants.map((variant) => variant.toJSON()),
  });
};

exports.listProducts = async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(MAX_LIMIT, parseInt(req.query.limit, 10) || 20);
  const skip = (page - 1) * limit;
  const includeVariants = parseBoolean(req.query.includeVariants) === true;

  const filter = {};
  const publishedValue = parseBoolean(req.query.isPublished);

  if (req.query.search) {
    const regex = new RegExp(req.query.search, "i");
    filter.$or = [{ name: regex }, { description: regex }, { slug: regex }];
  }

  try {
    if (req.query.categoryId !== undefined) {
      filter.categoryId = normalizeNullableObjectId(req.query.categoryId, "categoryId");
      if (!filter.categoryId) {
        const error = new Error("categoryId is invalid");
        error.statusCode = 400;
        throw error;
      }
    }

    if (req.query.subcategoryId !== undefined) {
      filter.subcategoryId = normalizeNullableObjectId(req.query.subcategoryId, "subcategoryId");
      if (!filter.subcategoryId) {
        const error = new Error("subcategoryId is invalid");
        error.statusCode = 400;
        throw error;
      }
    }
  } catch (error) {
    return sendKnownError(res, error);
  }

  if (publishedValue !== undefined) {
    filter.isPublished = publishedValue;
  } else if (!isAdmin(req)) {
    filter.isPublished = true;
  }

  const [products, total] = await Promise.all([
    Product.find(filter)
      .populate(PRODUCT_CATEGORY_POPULATE)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Product.countDocuments(filter),
  ]);

  let variantsByProduct = {};
  if (includeVariants && products.length > 0) {
    const variants = await Variant.find({
      productId: { $in: products.map((product) => product._id) },
    }).sort({ createdAt: 1 });

    variantsByProduct = variants.reduce((acc, variant) => {
      const productId = variant.productId.toString();
      if (!acc[productId]) {
        acc[productId] = [];
      }
      acc[productId].push(variant);
      return acc;
    }, {});
  }

  return res.json({
    products: products.map((product) =>
      serializeProduct(
        product,
        includeVariants ? variantsByProduct[product._id.toString()] ?? [] : undefined
      )
    ),
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
  });
};

exports.getProduct = async (req, res) => {
  const product = await findProductByParam(req.params.id);

  if (!product) {
    return res.status(404).json({ error: "Product not found" });
  }

  if (!product.isPublished && !isAdmin(req)) {
    return res.status(404).json({ error: "Product not found" });
  }

  const variants = await Variant.find({ productId: product._id }).sort({ createdAt: 1 });

  return res.json({
    product: serializeProduct(product),
    variants: variants.map((variant) => variant.toJSON()),
  });
};

exports.updateProduct = async (req, res) => {
  try {
    ensureValidObjectId(req.params.id, "Product id");
  } catch (error) {
    return sendKnownError(res, error);
  }

  const product = await Product.findById(req.params.id);

  if (!product) {
    return res.status(404).json({ error: "Product not found" });
  }

  let data;
  try {
    const productData = await buildProductPayload(req.body, product);
    const categoryData = await buildProductCategoryPayload(req.body, product);
    data = { ...productData, ...categoryData };
  } catch (error) {
    return sendKnownError(res, error);
  }
  Object.assign(product, data);
  await product.save();

  const populatedProduct = await Product.findById(product._id).populate(PRODUCT_CATEGORY_POPULATE);

  return res.json({
    message: "Product updated successfully",
    product: serializeProduct(populatedProduct || product),
  });
};

exports.deleteProduct = async (req, res) => {
  try {
    ensureValidObjectId(req.params.id, "Product id");
  } catch (error) {
    return sendKnownError(res, error);
  }

  const product = await Product.findById(req.params.id);

  if (!product) {
    return res.status(404).json({ error: "Product not found" });
  }

  const imageKeys = product.images.map((image) => image.key).filter(Boolean);

  await Promise.all([
    Variant.deleteMany({ productId: product._id }),
    product.deleteOne(),
  ]);

  if (imageKeys.length > 0) {
    await removeFilesFromStorage(imageKeys);
  }

  return res.json({
    message: "Product deleted successfully",
  });
};

exports.createVariant = async (req, res) => {
  try {
    ensureValidObjectId(req.params.productId, "Product id");
  } catch (error) {
    return sendKnownError(res, error);
  }

  const product = await Product.findById(req.params.productId);

  if (!product) {
    return res.status(404).json({ error: "Product not found" });
  }

  if (!req.body.name || req.body.price === undefined || req.body.stock === undefined) {
    return res.status(400).json({
      error: "name, price, and stock are required",
    });
  }

  let payload;
  try {
    payload = buildVariantPayload(req.body);
  } catch (error) {
    return sendKnownError(res, error);
  }

  const variant = await Variant.create({
    ...payload,
    productId: product._id,
  });

  return res.status(201).json({
    message: "Variant created successfully",
    variant: variant.toJSON(),
  });
};

exports.listVariants = async (req, res) => {
  try {
    ensureValidObjectId(req.params.productId, "Product id");
  } catch (error) {
    return sendKnownError(res, error);
  }

  const product = await Product.findById(req.params.productId);

  if (!product) {
    return res.status(404).json({ error: "Product not found" });
  }

  if (!product.isPublished && !isAdmin(req)) {
    return res.status(404).json({ error: "Product not found" });
  }

  const variants = await Variant.find({ productId: product._id }).sort({ createdAt: 1 });

  return res.json({ variants });
};

exports.getVariant = async (req, res) => {
  try {
    ensureValidObjectId(req.params.productId, "Product id");
    ensureValidObjectId(req.params.variantId, "Variant id");
  } catch (error) {
    return sendKnownError(res, error);
  }

  const variant = await Variant.findOne({
    _id: req.params.variantId,
    productId: req.params.productId,
  });

  if (!variant) {
    return res.status(404).json({ error: "Variant not found" });
  }

  const product = await Product.findById(variant.productId);
  if (!product || (!product.isPublished && !isAdmin(req))) {
    return res.status(404).json({ error: "Variant not found" });
  }

  return res.json({ variant });
};

exports.updateVariant = async (req, res) => {
  try {
    ensureValidObjectId(req.params.productId, "Product id");
    ensureValidObjectId(req.params.variantId, "Variant id");
  } catch (error) {
    return sendKnownError(res, error);
  }

  const variant = await Variant.findOne({
    _id: req.params.variantId,
    productId: req.params.productId,
  });

  if (!variant) {
    return res.status(404).json({ error: "Variant not found" });
  }

  let payload;
  try {
    payload = buildVariantPayload(req.body);
  } catch (error) {
    return sendKnownError(res, error);
  }

  Object.assign(variant, payload);
  await variant.save();

  return res.json({
    message: "Variant updated successfully",
    variant: variant.toJSON(),
  });
};

exports.deleteVariant = async (req, res) => {
  try {
    ensureValidObjectId(req.params.productId, "Product id");
    ensureValidObjectId(req.params.variantId, "Variant id");
  } catch (error) {
    return sendKnownError(res, error);
  }

  const variant = await Variant.findOne({
    _id: req.params.variantId,
    productId: req.params.productId,
  });

  if (!variant) {
    return res.status(404).json({ error: "Variant not found" });
  }

  await variant.deleteOne();

  return res.json({
    message: "Variant deleted successfully",
  });
};
