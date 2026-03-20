const mongoose = require("mongoose");

const bakongPaymentSchema = new mongoose.Schema(
  {
    payment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      required: [true, "Payment is required"],
      unique: true,
      index: true,
    },
    merchantId: {
      type: String,
      default: null,
      trim: true,
    },
    merchantName: {
      type: String,
      default: null,
      trim: true,
    },
    merchantCity: {
      type: String,
      default: null,
      trim: true,
    },
    qrString: {
      type: String,
      required: [true, "QR string is required"],
    },
    md5: {
      type: String,
      required: [true, "MD5 is required"],
      index: true,
    },
    bakongHash: {
      type: String,
      default: null,
      trim: true,
    },
    fromAccountId: {
      type: String,
      default: null,
      trim: true,
    },
    toAccountId: {
      type: String,
      default: null,
      trim: true,
    },
    description: {
      type: String,
      default: null,
      trim: true,
    },
    externalRef: {
      type: String,
      default: null,
      trim: true,
    },
    transactionId: {
      type: String,
      default: null,
      trim: true,
    },
    receiverBank: {
      type: String,
      default: null,
      trim: true,
    },
    receiverBankAccount: {
      type: String,
      default: null,
      trim: true,
    },
    instructionRef: {
      type: String,
      default: null,
      trim: true,
    },
    deepLink: {
      type: String,
      default: null,
      trim: true,
    },
    shortLink: {
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

const BakongPayment = mongoose.model("BakongPayment", bakongPaymentSchema);

module.exports = { BakongPayment };
