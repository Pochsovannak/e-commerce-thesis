const mongoose = require("mongoose");

const cartSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
      unique: true,
      index: true,
    },
    coupon: {
      type: String,
      trim: true,
      default: null,
    },
    discount: {
      type: Number,
      default: 0,
      min: [0, "Discount cannot be negative"],
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

cartSchema.index({ updatedAt: -1 });

const Cart = mongoose.model("Cart", cartSchema);

module.exports = { Cart };
