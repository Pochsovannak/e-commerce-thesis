const { Product } = require("../products/products.model");
const { Category } = require("./categoies.model");
const {
  buildCategoryPayload,
  buildCategoryTree,
  findCategoryByParam,
  normalizeNullableObjectId,
} = require("./categoies.service");

const parseBoolean = (value) => {
  if (value === true || value === false) return value;
  if (typeof value !== "string") return undefined;
  if (value.toLowerCase() === "true") return true;
  if (value.toLowerCase() === "false") return false;
  return undefined;
};

const sendKnownError = (res, error) =>
  res.status(error.statusCode || 400).json({ error: error.message });

exports.createCategory = async (req, res) => {
  if (!req.body.name) {
    return res.status(400).json({ error: "name is required" });
  }

  let payload;
  try {
    payload = await buildCategoryPayload(req.body);
  } catch (error) {
    return sendKnownError(res, error);
  }

  const category = await Category.create(payload);

  return res.status(201).json({
    message: "Category created successfully",
    category: category.toJSON(),
  });
};

exports.listCategories = async (req, res) => {
  const flat = parseBoolean(req.query.flat) === true;
  const categories = await Category.find().sort({ parentId: 1, name: 1, createdAt: 1 });

  return res.json({
    categories: flat ? categories.map((category) => category.toJSON()) : buildCategoryTree(categories),
  });
};

exports.getCategory = async (req, res) => {
  const category = await findCategoryByParam(req.params.id);

  if (!category) {
    return res.status(404).json({ error: "Category not found" });
  }

  const [parent, subcategories] = await Promise.all([
    category.parentId ? Category.findById(category.parentId) : null,
    Category.find({ parentId: category._id }).sort({ name: 1, createdAt: 1 }),
  ]);

  return res.json({
    category: category.toJSON(),
    parent: parent ? parent.toJSON() : null,
    subcategories: subcategories.map((subcategory) => subcategory.toJSON()),
  });
};

exports.updateCategory = async (req, res) => {
  try {
    normalizeNullableObjectId(req.params.id, "Category id");
  } catch (error) {
    return sendKnownError(res, error);
  }

  const category = await Category.findById(req.params.id);

  if (!category) {
    return res.status(404).json({ error: "Category not found" });
  }

  let payload;
  try {
    payload = await buildCategoryPayload(req.body, category);
  } catch (error) {
    return sendKnownError(res, error);
  }

  Object.assign(category, payload);
  await category.save();

  return res.json({
    message: "Category updated successfully",
    category: category.toJSON(),
  });
};

exports.deleteCategory = async (req, res) => {
  try {
    normalizeNullableObjectId(req.params.id, "Category id");
  } catch (error) {
    return sendKnownError(res, error);
  }

  const category = await Category.findById(req.params.id);

  if (!category) {
    return res.status(404).json({ error: "Category not found" });
  }

  const [hasSubcategories, hasLinkedProducts] = await Promise.all([
    Category.exists({ parentId: category._id }),
    Product.exists({
      $or: [{ categoryId: category._id }, { subcategoryId: category._id }],
    }),
  ]);

  if (hasSubcategories) {
    return res.status(400).json({
      error: "Delete subcategories before deleting this category",
    });
  }

  if (hasLinkedProducts) {
    return res.status(400).json({
      error: "Category is linked to products and cannot be deleted",
    });
  }

  await category.deleteOne();

  return res.json({
    message: "Category deleted successfully",
  });
};
