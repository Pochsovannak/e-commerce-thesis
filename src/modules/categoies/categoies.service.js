const mongoose = require("mongoose");
const { Category } = require("./categoies.model");

const PRODUCT_CATEGORY_POPULATE = [{ path: "categoryId" }, { path: "subcategoryId" }];

const slugify = (value = "") =>
  value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const normalizeNullableObjectId = (value, fieldName) => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;

  const normalized = value.toString().trim();
  if (!mongoose.isValidObjectId(normalized)) {
    const error = new Error(`${fieldName} is invalid`);
    error.statusCode = 400;
    throw error;
  }

  return normalized;
};

const toIdString = (value) => {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    if (value.id) return value.id.toString();
    if (value._id) return value._id.toString();
  }

  return value.toString();
};

const isPopulatedCategory = (value) =>
  Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value.slug || value.name || value.id || value._id)
  );

const findCategoryByParam = async (value) => {
  if (mongoose.isValidObjectId(value)) {
    const categoryById = await Category.findById(value);
    if (categoryById) return categoryById;
  }

  return Category.findOne({ slug: value });
};

const buildCategoryTree = (categoryDocs) => {
  const categories = categoryDocs.map((categoryDoc) => ({
    ...categoryDoc.toJSON(),
    subcategories: [],
  }));

  const categoriesById = new Map(categories.map((category) => [category.id, category]));

  return categories.reduce((acc, category) => {
    if (category.parentId) {
      const parent = categoriesById.get(category.parentId);
      if (parent) {
        parent.subcategories.push(category);
        return acc;
      }
    }

    acc.push(category);
    return acc;
  }, []);
};

const buildCategoryPayload = async (payload, currentCategory) => {
  const data = {};

  if (payload.name !== undefined) data.name = payload.name;
  if (payload.description !== undefined) data.description = payload.description;

  if (payload.parentId !== undefined) {
    const parentId = normalizeNullableObjectId(payload.parentId, "parentId");

    if (parentId && currentCategory && currentCategory._id.toString() === parentId) {
      const error = new Error("A category cannot be its own parent");
      error.statusCode = 400;
      throw error;
    }

    if (parentId) {
      const parent = await Category.findById(parentId);

      if (!parent) {
        const error = new Error("Parent category not found");
        error.statusCode = 404;
        throw error;
      }

      if (parent.parentId) {
        const error = new Error("parentId must reference a top-level category");
        error.statusCode = 400;
        throw error;
      }

      if (currentCategory) {
        const hasChildren = await Category.exists({ parentId: currentCategory._id });
        if (hasChildren) {
          const error = new Error("Category with subcategories cannot become a subcategory");
          error.statusCode = 400;
          throw error;
        }
      }

      data.parentId = parent._id;
    } else {
      data.parentId = null;
    }
  }

  const nextName = data.name ?? currentCategory?.name ?? payload.name;
  const shouldUpdateSlug =
    !currentCategory || payload.slug !== undefined || payload.name !== undefined;
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

    const existingCategory = await Category.findOne({
      slug,
      ...(currentCategory ? { _id: { $ne: currentCategory._id } } : {}),
    });

    if (existingCategory) {
      const error = new Error("Category slug already exists");
      error.statusCode = 409;
      throw error;
    }

    data.slug = slug;
  }

  return data;
};

const buildProductCategoryPayload = async (payload, currentProduct) => {
  const hasCategoryInput = payload.categoryId !== undefined;
  const hasSubcategoryInput = payload.subcategoryId !== undefined;

  if (!hasCategoryInput && !hasSubcategoryInput) {
    return {};
  }

  const categoryIdInput = normalizeNullableObjectId(payload.categoryId, "categoryId");
  const subcategoryIdInput = normalizeNullableObjectId(payload.subcategoryId, "subcategoryId");

  const currentCategoryId = toIdString(currentProduct?.categoryId);
  const currentSubcategoryId = toIdString(currentProduct?.subcategoryId);

  const categoryChanged =
    hasCategoryInput && `${categoryIdInput ?? ""}` !== `${currentCategoryId ?? ""}`;

  const nextCategoryId = hasCategoryInput ? categoryIdInput : currentCategoryId;
  const nextSubcategoryId = hasSubcategoryInput
    ? subcategoryIdInput
    : hasCategoryInput
      ? categoryChanged
        ? null
        : currentSubcategoryId
      : currentSubcategoryId;

  if (!nextCategoryId && nextSubcategoryId) {
    const error = new Error("categoryId is required when subcategoryId is provided");
    error.statusCode = 400;
    throw error;
  }

  let category = null;
  if (nextCategoryId) {
    category = await Category.findById(nextCategoryId);

    if (!category) {
      const error = new Error("Category not found");
      error.statusCode = 404;
      throw error;
    }

    if (category.parentId) {
      const error = new Error("categoryId must reference a top-level category");
      error.statusCode = 400;
      throw error;
    }
  }

  let subcategory = null;
  if (nextSubcategoryId) {
    subcategory = await Category.findById(nextSubcategoryId);

    if (!subcategory) {
      const error = new Error("Subcategory not found");
      error.statusCode = 404;
      throw error;
    }

    if (!subcategory.parentId) {
      const error = new Error("subcategoryId must reference a subcategory");
      error.statusCode = 400;
      throw error;
    }

    if (!category || subcategory.parentId.toString() !== category._id.toString()) {
      const error = new Error("subcategoryId must belong to the selected category");
      error.statusCode = 400;
      throw error;
    }
  }

  const data = {};
  if (hasCategoryInput) {
    data.categoryId = category ? category._id : null;
  }
  if (hasSubcategoryInput || hasCategoryInput) {
    data.subcategoryId = subcategory ? subcategory._id : null;
  }

  return data;
};

const serializeProductCategories = (product) => {
  const data = typeof product?.toJSON === "function" ? product.toJSON() : { ...product };
  const category = isPopulatedCategory(data.categoryId) ? data.categoryId : null;
  const subcategory = isPopulatedCategory(data.subcategoryId) ? data.subcategoryId : null;

  return {
    ...data,
    categoryId: category ? toIdString(category) : toIdString(data.categoryId),
    subcategoryId: subcategory ? toIdString(subcategory) : toIdString(data.subcategoryId),
    category,
    subcategory,
  };
};

module.exports = {
  PRODUCT_CATEGORY_POPULATE,
  buildCategoryPayload,
  buildCategoryTree,
  buildProductCategoryPayload,
  findCategoryByParam,
  normalizeNullableObjectId,
  serializeProductCategories,
};
