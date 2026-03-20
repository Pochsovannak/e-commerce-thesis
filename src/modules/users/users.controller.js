const { User } = require("./users.model");
const { Session } = require("../auth/sessions.model");
const { generateToken, hashToken, addDays } = require("../../utils/token.util");
const { sendVerificationEmail } = require("../../utils/email.util");
const Roles = require("../../constants/Roles");
const { Verification } = require("../auth/verifications.model");
const Verifications = require("../../constants/Verifications");

exports.updateUserProfile = async (req, res) => {
  const userId = req.userId;

  const { name, email, phoneNumber, image } = req.body;

  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  if (email && email !== user.email) {
    const existingEmail = await User.findOne({ email: email.toLowerCase() });
    if (existingEmail) {
      return res.status(409).json({ error: "Email already in use" });
    }
    user.email = email.toLowerCase();
    user.emailVerified = false;

    await Verification.deleteMany({
      identifier: user.email,
      type: Verifications.EMAIL_VERIFICATION,
    });

    const rawToken = generateToken();
    await Verification.create({
      identifier: user.email,
      value: hashToken(rawToken),
      type: Verifications.EMAIL_VERIFICATION,
      expiresAt: addDays(1),
    });

    sendVerificationEmail(user.email, rawToken).catch(console.error);
  }

  if (phoneNumber && phoneNumber !== user.phoneNumber) {
    const existingPhoneNumber = await User.findOne({ phoneNumber: phoneNumber });
    if (existingPhoneNumber) {
      return res.status(409).json({ error: "Phone number already in use" });
    }
    user.phoneNumber = phoneNumber;
    user.phoneNumberVerified = false;
  }

  if (name) user.name = name;
  if (image) user.image = image;

  await user.save();

  return res.json({
    message: "Profile updated successfully",
    user: user.toJSON(),
  });
};

exports.adminListUsers = async (req, res) => {
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 20);
  const skip  = (page - 1) * limit;
 
  const filter = {};
  if (req.query.search) {
    const regex = new RegExp(req.query.search, "i");
    filter.$or = [{ name: regex }, { email: regex }];
  }
  if (req.query.status !== undefined) filter.status = req.query.status === "true";
  if (req.query.role) filter.role   = req.query.role;
 
  const [users, total] = await Promise.all([
    User.find(filter).select("-__v").sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);
 
  return res.json({
    users,
    pagination: { total, page, limit, pages: Math.ceil(total / limit) },
  });
};

exports.adminGetUser = async (req, res) => {
  const user = await User.findById(req.params.id).select("-__v");
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  return res.json({ user });
};

exports.adminSetUserStatus = async (req, res) => {
  const { status } = req.body;
 
  if (typeof status !== "boolean") {
    return res.status(400).json({ error: "status must be a boolean" });
  }
 
  const user = await User.findById(req.params.id);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
 
  if (user._id.toString() === req.userId.toString()) {
    return res.status(400).json({ error: "You cannot change your own status" });
  }
 
  user.status = status;
  await user.save();
 
  // Revoke all sessions immediately on ban
  if (!status) {
    await Session.deleteMany({ user: user._id });
  }
 
  return res.json({
    message: `User ${status ? "unbanned" : "banned"} successfully`,
    user: user.toJSON(),
  });
};

// ─── Admin: change user role ──────────────────────────────────────────────────
exports.adminSetUserRole = async (req, res) => {
  const { role } = req.body;
 
  const allowedRoles = Object.values(Roles);
  if (!allowedRoles.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${allowedRoles.join(", ")}` });
  }
 
  const user = await User.findById(req.params.id);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
 
  if (user._id.toString() === req.userId.toString()) {
    return res.status(400).json({ error: "You cannot change your own role" });
  }
 
  user.role = role;
  await user.save();
 
  return res.json({ message: `User role updated to ${role}`, user: user.toJSON() });
};


