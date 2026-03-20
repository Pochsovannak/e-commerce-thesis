const { Router } = require("express");
const { optionalAuth, requireAuth } = require("../../middleware/auth");
const authorize = require("../../middleware/authorize");
const Roles = require("../../constants/Roles");
const {
  createProduct,
  createVariant,
  deleteProduct,
  deleteVariant,
  getProduct,
  getVariant,
  listProducts,
  listVariants,
  updateProduct,
  updateVariant,
} = require("./products.controller");

const router = Router();
const requireCatalogManager = [requireAuth, authorize(Roles.ADMIN, Roles.MODERATOR)];

router.get("/", optionalAuth, listProducts);
router.post("/", ...requireCatalogManager, createProduct);
router.get("/:id", optionalAuth, getProduct);
router.patch("/:id", ...requireCatalogManager, updateProduct);
router.delete("/:id", ...requireCatalogManager, deleteProduct);

router.get("/:productId/variants", optionalAuth, listVariants);
router.post("/:productId/variants", ...requireCatalogManager, createVariant);
router.get("/:productId/variants/:variantId", optionalAuth, getVariant);
router.patch("/:productId/variants/:variantId", ...requireCatalogManager, updateVariant);
router.delete("/:productId/variants/:variantId", ...requireCatalogManager, deleteVariant);

module.exports = router;
