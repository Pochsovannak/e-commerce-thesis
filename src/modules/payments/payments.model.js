const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: [true, "Order is required"],
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
      index: true,
    },
    amount: {
      type: Number,
      required: [true, "Amount is required"],
      min: [0, "Amount cannot be negative"],
    },
    currency: {
      type: String,
      enum: ["USD", "KHR"],
      default: "USD",
    },
    method: {
      type: String,
      enum: ["bakong_khqr"],
      default: "bakong_khqr",
    },
    expiresAt: {
      type: Date,
      required: [true, "Expiry time is required"],
    },
    status: {
      type: String,
      enum: ["pending", "paid", "expired", "failed", "cancelled"],
      default: "pending",
      index: true,
    },
    paidAt: {
      type: Date,
      default: null,
    },
    isPaid: {
      type: Boolean,
      default: false,
      index: true,
    },
    failReason: {
      type: String,
      default: null,
      trim: true,
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

paymentSchema.index({ createdAt: -1 });

const Payment = mongoose.model("Payment", paymentSchema);

module.exports = { Payment };
