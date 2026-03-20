const mongoose = require("mongoose");

const cartItemSchema = new mongoose.Schema(
  {
    cart: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Cart",
      required: [true, "Cart is required"],
      index: true,
    },
    variant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Variant",
      required: [true, "Variant is required"],
      index: true,
    },
    quantity: {
      type: Number,
      required: [true, "Quantity is required"],
      min: [1, "Quantity must be at least 1"],
      default: 1,
    },
    unitPrice: {
      type: Number,
      required: [true, "Unit price is required"],
      min: [0, "Unit price cannot be negative"],
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

cartItemSchema.index({ cart: 1, variant: 1 }, { unique: true });

const CartItem = mongoose.model("CartItem", cartItemSchema);

module.exports = { CartItem };
