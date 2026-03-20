const connectMongoDB = require("./connection");
const Roles = require("../constants/Roles");
const { hashing } = require("../utils/argon.util");
const { User } = require("../modules/users/users.model");
const { Account } = require("../modules/auth/accounts.model");

const DEFAULT_ADMIN = {
  name: process.env.ADMIN_NAME || "System Admin",
  email: (process.env.ADMIN_EMAIL || "admin@example.com").toLowerCase(),
  password: process.env.ADMIN_PASSWORD || "Admin@123456",
  phoneNumber: process.env.ADMIN_PHONE || "+855000000000",
};

async function seedAdminUser() {
  await connectMongoDB();

  const { name, email, password, phoneNumber } = DEFAULT_ADMIN;

  if (!password || password.length < 8) {
    throw new Error("ADMIN_PASSWORD must be at least 8 characters");
  }

  let user = await User.findOne({ email });

  if (!user) {
    user = await User.create({
      name,
      email,
      phoneNumber,
      role: Roles.ADMIN,
      emailVerified: true,
      phoneNumberVerified: true,
    });

    console.info(`Created admin user: ${email}`);
  } else {
    user.name = name;
    user.phoneNumber = phoneNumber;
    user.role = Roles.ADMIN;
    user.emailVerified = true;
    user.phoneNumberVerified = true;
    await user.save();

    console.info(`Updated existing admin user: ${email}`);
  }

  const hashedPassword = await hashing(password);
  const account = await Account.findOne({ user: user._id, providerId: "credential" });

  if (!account) {
    await Account.create({
      user: user._id,
      accountId: user._id.toString(),
      providerId: "credential",
      password: hashedPassword,
    });

    console.info("Created admin credential account");
  } else {
    account.accountId = user._id.toString();
    account.password = hashedPassword;
    await account.save();

    console.info("Updated admin credential account password");
  }

  return user;
}

async function run() {
  try {
    const user = await seedAdminUser();
    console.info(`Admin seeding completed for ${user.email}`);
    process.exit(0);
  } catch (error) {
    console.error("Admin seeding failed:", error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  run();
}

module.exports = {
  seedAdminUser,
};
