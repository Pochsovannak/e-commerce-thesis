const mongoose = require("mongoose");
const Roles = require("../../constants/Roles");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Invalid email format"],
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    phoneNumber: {
      type: String,
      trim: true,
      maxlength: [20, "Phone number cannot exceed 20 characters"],
    },
    phoneNumberVerified: {
      type: Boolean,
      default: false,
    },
    image: {
      type: String,
      default: null,
    },
    role: {
      type: String,
      enum: Object.values(Roles),
      default: Roles.USER,
    },
    status: {
      type: Boolean,
      default: true,
      index: true,
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

const User = mongoose.model("User", userSchema);

module.exports = { User };
