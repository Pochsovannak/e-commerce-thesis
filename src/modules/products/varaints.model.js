const mongoose = require("mongoose");

const variantSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: [true, "Product id is required"],
      index: true,
    },
    name: {
      type: String,
      required: [true, "Variant name is required"],
      trim: true,
      maxlength: [100, "Variant name cannot exceed 100 characters"],
    },
    price: {
      type: Number,
      required: [true, "Price is required"],
      min: [0, "Price cannot be negative"],
    },
    size: {
      type: String,
      required: [true, "Size is required"],
      enum: ["XS", "S", "M", "L", "XL", "XXL"],
    },
    stock: {
      type: Number,
      required: [true, "Stock is required"],
      min: [0, "Stock cannot be negative"],
      default: 0,
    },
    attributes: {
      type: Map,
      of: String,
      default: {},
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

variantSchema.index({ productId: 1, name: 1 }, { unique: true });

const Variant = mongoose.model("Variant", variantSchema);

module.exports = { Variant };
