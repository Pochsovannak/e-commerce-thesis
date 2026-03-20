const AuthProviders = require("../../constants/AuthProviders");
const Verifications = require("../../constants/Verifications");
const { hashing, verifyHash } = require("../../utils/argon.util");
const {
  sendVerificationEmail,
  sendPasswordResetEmail,
} = require("../../utils/email.util");
const { isValidTelegramAuthDate, validateTelegramAuth } = require("../../utils/telegram.util");
const {
  addDays,
  addMinutes,
  expiryFromEnv,
  generateToken,
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} = require("../../utils/token.util");
const { User } = require("../users/users.model");
const { Account } = require("./accounts.model");
const { Session } = require("./sessions.model");
const { Verification } = require("./verifications.model");

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
};

function setTokenCookies(res, { refreshToken }) {
  res.cookie("refreshToken", refreshToken, {
    ...COOKIE_OPTIONS,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function clearTokenCookies(res) {
  res.clearCookie("refreshToken", {
    ...COOKIE_OPTIONS,
  });
}

exports.register = async (req, res, next) => {
  const { name, email, password, phoneNumber } = req.body;

  if (!name || !email || !password || !phoneNumber) {
    return res.status(400).json({
      error: "name, email, password, and phoneNumber are required",
    });
  }

  if (password.length < 8) {
    return res
      .status(400)
      .json({ error: "Password must be at least 8 characters" });
  }

  const normalizedEmail = email.toLowerCase();
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    return res.status(409).json({ error: "Email already registered" });
  }

  const user = await User.create({
    name,
    email: normalizedEmail,
    phoneNumber: phoneNumber,
  });

  const hashedPassword = await hashing(password);
  await Account.create({
    user: user._id,
    accountId: user._id.toString(),
    providerId: "credential",
    password: hashedPassword,
  });

  return res.status(201).json({
    message: "Account created. Please verify your email.",
    user: user.toJSON(),
  });
};

exports.login = async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }

  const normalizedEmail = email.toLowerCase();
  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    return res.status(401).json({ error: "Invalid email or password" });
  }
  if (user.status === false) {
    return res.status(403).json({
      error: "Your account has been disabled. Please contact support.",
    });
  }

  const account = await Account.findOne({
    user: user._id,
    providerId: AuthProviders.CREDENTIAL,
  }).select("+password");

  if (!account?.password) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const isValid = await verifyHash(account.password, password);
  if (!isValid) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const { session, accessToken, refreshToken } = await issueSessionTokens(
    user,
    req
  );

  setTokenCookies(res, { refreshToken });

  return res.json({
    user: user.toJSON(),
    accessToken,
    refreshToken,
    session: { id: session._id, expiresAt: session.expiresAt },
  });
};

exports.loginWithTelegram = async (req, res, next) => {
  const {
    id: provider_id,
    username,
    first_name,
    last_name,
    auth_date,
    hash,
    photo_url,
  } = req.body;

  if (!auth_date || !hash) {
    return res
      .status(400)
      .json({ error: "Missing Telegram auth data" });
  }

  if (!isValidTelegramAuthDate(Number(auth_date))) {
    return res
      .status(400)
      .json({ error: "Authentication data expired" });
  }

  if (!validateTelegramAuth(req.body)) {
    return res
      .status(401)
      .json({ error: "Invalid telegram auth" });
  }

  let account = await Account.findOne({
    providerId: AuthProviders.TELEGRAM,
    accountId: provider_id.toString(),
  });

  let user;

  if (account) {
    user = await User.findById(account.user);
  } else {
    const safeUsername =
      username ??
      (first_name
        ? `${first_name}${last_name ? "_" + last_name : ""}`
        : `user_${provider_id}`);

    user = await User.create({
      name: safeUsername,
      email: `${provider_id}@telegram.local`,
      emailVerified: true,
      image: photo_url || null,
    });

    account = await Account.create({
      user: user._id,
      accountId: provider_id.toString(),
      providerId: AuthProviders.TELEGRAM,
    });
  }

  if (user.status === false) {
    return res.status(403).json({
      error: "Your account has been disabled. Please contact support."
    });
  }

  const { session, accessToken, refreshToken } = await issueSessionTokens(
    user,
    req
  );

  setTokenCookies(res, { refreshToken });

  return res.json({
    user: user.toJSON(),
    accessToken,
    refreshToken,
    session: { id: session._id, expiresAt: session.expiresAt },
  });
};

exports.refresh = async (req, res, next) => {
  const token = req.cookies?.refreshToken ?? req.body?.refreshToken;

  if (!token) {
    return res.status(401).json({ error: "No refresh token provided" });
  }

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    return res.status(401).json({ error: "Invalid or expired refresh token" });
  }

  const session = await Session.findById(payload.sessionId);
  if (!session || session.expiresAt < new Date()) {
    clearTokenCookies(res);
    return res.status(401).json({ error: "Session expired or not found" });
  }

  if (session.token !== hashToken(token)) {
    await Session.deleteMany({ user: session.user });
    clearTokenCookies(res);
    return res.status(401).json({
      error: "Token reuse detected. All sessions revoked.",
    });
  }

  const user = await User.findById(session.user);
  if (!user) {
    clearTokenCookies(res);
    return res.status(401).json({ error: "User not found" });
  }
  if (user.status === false) {
    await Session.deleteMany({ user: user._id });
    clearTokenCookies(res);
    return res.status(403).json({
      error: "Your account has been disabled. Please contact support.",
    });
  }

  await Session.deleteOne({ _id: session._id });

  const {
    session: newSession,
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  } = await issueSessionTokens(user, req);

  setTokenCookies(res, { refreshToken: newRefreshToken });

  return res.json({
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    session: { id: newSession._id, expiresAt: newSession.expiresAt },
  });
};

exports.logout = async (req, res, next) => {
  const token = req.cookies?.refreshToken ?? req.body?.refreshToken;
  if (token) {
    try {
      const payload = verifyRefreshToken(token);
      await Session.findByIdAndDelete(payload.sessionId);
    } catch {
      // ignore invalid tokens during logout
    }
  }

  clearTokenCookies(res);
  return res.json({ message: "Logged out successfully" });
};

exports.logoutAll = async (req, res, next) => {
  await Session.deleteMany({ user: req.userId });
  clearTokenCookies(res);
  return res.json({ message: "All sessions revoked" });
};

exports.me = (req, res) => {
  return res.json({ user: req.user.toJSON() });
};

exports.deleteUserAccount = async (req, res) => {
  const userId = req.userId;

  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  await Session.deleteMany({ user: userId });
  await Account.deleteMany({ user: userId });
  await Verification.deleteMany({ identifier: user.email });

  // FIX: was user.phoneNumber — schema stores it as user.phone
  if (user.phoneNumber) {
    await Verification.deleteMany({ identifier: user.phoneNumber });
  }

  await user.deleteOne();

  return res.status(200).json({
    message: "Your account has been deleted successfully",
  });
};

exports.getSessions = async (req, res, next) => {
  const sessions = await Session.find({ user: req.userId }).select("-token");
  return res.json({ sessions });
};

exports.verifyEmail = async (req, res, next) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: "Token is required" });
  }

  const verification = await Verification.findOne({
    value: hashToken(token),
    type: Verifications.EMAIL_VERIFICATION,
    expiresAt: { $gt: new Date() },
  });

  if (!verification) {
    return res
      .status(400)
      .json({ error: "Invalid or expired verification token" });
  }

  await User.findOneAndUpdate(
    { email: verification.identifier },
    { emailVerified: true }
  );
  await Verification.deleteOne({ _id: verification._id });

  return res.json({ message: "Email verified successfully" });
};

exports.resendVerification = async (req, res, next) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  const normalizedEmail = email.toLowerCase();
  const user = await User.findOne({ email: normalizedEmail });

  if (!user || user.emailVerified) {
    return res.json({
      message: "If that email exists and is unverified, a new email has been sent.",
    });
  }

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

  return res.json({
    message: "If that email exists and is unverified, a new email has been sent.",
  });
};

exports.forgotPassword = async (req, res, next) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  const normalizedEmail = email.toLowerCase();
  const user = await User.findOne({ email: normalizedEmail });

  if (user) {
    await Verification.deleteMany({
      identifier: user.email,
      type: Verifications.PASSWORD_RESET,
    });

    const rawToken = generateToken();
    await Verification.create({
      identifier: user.email,
      value: hashToken(rawToken),
      type: Verifications.PASSWORD_RESET,
      expiresAt: addMinutes(60),
    });

    sendPasswordResetEmail(user.email, rawToken).catch(console.error);
  }

  return res.json({
    message: "If that email exists, a reset link has been sent.",
  });
};

exports.resetPassword = async (req, res, next) => {
  const { token, password } = req.body;

  if (!token || !password) {
    return res
      .status(400)
      .json({ error: "token and password are required" });
  }

  if (password.length < 8) {
    return res
      .status(400)
      .json({ error: "Password must be at least 8 characters" });
  }

  const verification = await Verification.findOne({
    value: hashToken(token),
    type: Verifications.PASSWORD_RESET,
    expiresAt: { $gt: new Date() },
  });

  if (!verification) {
    return res.status(400).json({ error: "Invalid or expired reset token" });
  }

  const user = await User.findOne({ email: verification.identifier });
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  const newHash = await hashing(password);
  await Account.findOneAndUpdate(
    { user: user._id, providerId: AuthProviders.CREDENTIAL },
    { password: newHash }
  );

  await Session.deleteMany({ user: user._id });
  await Verification.deleteOne({ _id: verification._id });
  clearTokenCookies(res);

  return res.json({ message: "Password reset successfully. Please log in." });
};

exports.changePassword = async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      error: "currentPassword and newPassword are required",
    });
  }

  if (newPassword.length < 8) {
    return res
      .status(400)
      .json({ error: "New password must be at least 8 characters" });
  }

  const account = await Account.findOne({
    user: req.userId,
    providerId: AuthProviders.CREDENTIAL,
  }).select("+password");

  if (!account?.password) {
    return res.status(400).json({ error: "No credential account found" });
  }

  const isValid = await verifyHash(account.password, currentPassword);
  if (!isValid) {
    return res.status(401).json({ error: "Current password is incorrect" });
  }

  account.password = await hashing(newPassword);
  await account.save();

  await Session.deleteMany({ user: req.userId });
  clearTokenCookies(res);

  return res.json({ message: "Password changed. Please log in again." });
};

async function issueSessionTokens(user, req) {
  const accessToken = signAccessToken({
    sub: user._id.toString(),
    email: user.email,
  });

  const session = await Session.create({
    user: user._id,
    token: "__pending__",
    expiresAt: expiryFromEnv("REFRESH_TOKEN_EXPIRATION", "7d"),
    ipAddress: req.ip ?? req.socket?.remoteAddress ?? null,
    userAgent: req.headers["user-agent"] ?? null,
  });

  const finalRefreshToken = signRefreshToken({
    sub: user._id.toString(),
    sessionId: session._id.toString(),
  });

  await Session.updateOne(
    { _id: session._id },
    { token: hashToken(finalRefreshToken) }
  );

  session.token = hashToken(finalRefreshToken);

  return { session, accessToken, refreshToken: finalRefreshToken };
}
