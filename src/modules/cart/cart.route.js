const { Router } = require("express");
const { requireAuth } = require("../../middleware/auth");
const {
  addCartItem,
  clearMyCart,
  getMyCart,
  removeCartItem,
  updateCartItem,
  updateCartMeta,
} = require("./cart.controller");

const router = Router();

router.get("/", requireAuth, getMyCart);
router.patch("/", requireAuth, updateCartMeta);
router.delete("/", requireAuth, clearMyCart);

router.post("/items", requireAuth, addCartItem);
router.patch("/items/:itemId", requireAuth, updateCartItem);
router.delete("/items/:itemId", requireAuth, removeCartItem);

module.exports = router;
