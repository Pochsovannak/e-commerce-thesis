const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: [true, "Order is required"],
      index: true,
    },
    variant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Variant",
      required: [true, "Variant is required"],
    },
    productName: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
    },
    variantLabel: {
      type: String,
      required: [true, "Variant label is required"],
      trim: true,
    },
    quantity: {
      type: Number,
      required: [true, "Quantity is required"],
      min: [1, "Quantity must be at least 1"],
    },
    unitPrice: {
      type: Number,
      required: [true, "Unit price is required"],
      min: [0, "Unit price cannot be negative"],
    },
    totalPrice: {
      type: Number,
      required: [true, "Total price is required"],
      min: [0, "Total price cannot be negative"],
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

orderItemSchema.index({ order: 1, createdAt: 1 });

const OrderItem = mongoose.model("OrderItem", orderItemSchema);

module.exports = { OrderItem };
