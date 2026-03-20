const mongoose = require("mongoose");

const productImageSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: [true, "Image key is required"],
      trim: true,
    },
    url: {
      type: String,
      required: [true, "Image url is required"],
      trim: true,
    },
    name: {
      type: String,
      required: [true, "Image name is required"],
      trim: true,
    },
    size: {
      type: Number,
      required: [true, "Image size is required"],
      min: [0, "Image size cannot be negative"],
    },
    mimeType: {
      type: String,
      required: [true, "Image mimeType is required"],
      trim: true,
    },
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [3, "Name must be at least 3 characters"],
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    slug: {
      type: String,
      required: [true, "Slug is required"],
      unique: true,
      trim: true,
      lowercase: true,
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
    },
    basePrice: {
      type: Number,
      required: [true, "Base price is required"],
      min: [0, "Base price cannot be negative"],
    },
    discount: {
      type: Number,
      default: 0,
      min: [0, "Discount cannot be negative"],
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
      index: true,
    },
    subcategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
      index: true,
    },
    images: {
      type: [productImageSchema],
      default: [],
    },
    isPublished: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

productSchema.index({ name: 1 });
productSchema.index({ isPublished: 1 });
productSchema.index({ categoryId: 1, subcategoryId: 1 });

const Product = mongoose.model("Product", productSchema);

module.exports = { Product };
