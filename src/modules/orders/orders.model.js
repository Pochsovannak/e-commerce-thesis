const mongoose = require("mongoose");

const shippingAddressSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
    },
    phoneNumber: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
    },
    addressLine1: {
      type: String,
      required: [true, "Address line 1 is required"],
      trim: true,
    },
    addressLine2: {
      type: String,
      default: null,
      trim: true,
    },
    city: {
      type: String,
      required: [true, "City is required"],
      trim: true,
    },
    province: {
      type: String,
      required: [true, "Province is required"],
      trim: true,
    },
    postalCode: {
      type: String,
      default: null,
      trim: true,
    },
    country: {
      type: String,
      required: [true, "Country is required"],
      trim: true,
      default: "Cambodia",
    },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
      index: true,
    },
    orderNumber: {
      type: String,
      required: [true, "Order number is required"],
      unique: true,
      trim: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending_payment", "paid", "processing", "completed", "cancelled", "failed"],
      default: "pending_payment",
      index: true,
    },
    subtotal: {
      type: Number,
      required: [true, "Subtotal is required"],
      min: [0, "Subtotal cannot be negative"],
    },
    shippingFee: {
      type: Number,
      default: 0,
      min: [0, "Shipping fee cannot be negative"],
    },
    discountAmount: {
      type: Number,
      default: 0,
      min: [0, "Discount amount cannot be negative"],
    },
    totalAmount: {
      type: Number,
      required: [true, "Total amount is required"],
      min: [0, "Total amount cannot be negative"],
    },
    currency: {
      type: String,
      enum: ["USD", "KHR"],
      default: "USD",
    },
    shippingAddress: {
      type: shippingAddressSchema,
      required: [true, "Shipping address is required"],
    },
    note: {
      type: String,
      default: null,
      trim: true,
    },
    paidAt: {
      type: Date,
      default: null,
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

orderSchema.index({ createdAt: -1 });

const Order = mongoose.model("Order", orderSchema);

module.exports = { Order };
