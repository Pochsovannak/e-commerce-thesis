const { Router } = require("express");
const { requireAuth } = require("../../middleware/auth");
const authorize = require("../../middleware/authorize");
const Roles = require("../../constants/Roles");
const {
  adminListPayments,
  checkBakongPaymentStatus,
  getPayment,
} = require("./payments.controller");

const router = Router();

router.get("/admin", requireAuth, authorize(Roles.ADMIN, Roles.MODERATOR), adminListPayments);
router.get("/:id", requireAuth, getPayment);
router.post("/:id/check-bakong", requireAuth, checkBakongPaymentStatus);

module.exports = router;
