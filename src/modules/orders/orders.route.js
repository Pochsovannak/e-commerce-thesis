const { Router } = require("express");
const { requireAuth } = require("../../middleware/auth");
const authorize = require("../../middleware/authorize");
const Roles = require("../../constants/Roles");
const {
  adminListOrders,
  createOrderFromCart,
  getMyOrder,
  listMyOrders,
} = require("./orders.controller");

const router = Router();

router.get("/admin", requireAuth, authorize(Roles.ADMIN, Roles.MODERATOR), adminListOrders);
router.get("/", requireAuth, listMyOrders);
router.post("/checkout", requireAuth, createOrderFromCart);
router.get("/:id", requireAuth, getMyOrder);

module.exports = router;
