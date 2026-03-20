const { Router } = require("express");
const { optionalAuth, requireAuth } = require("../../middleware/auth");
const authorize = require("../../middleware/authorize");
const Roles = require("../../constants/Roles");
const {
  createCategory,
  deleteCategory,
  getCategory,
  listCategories,
  updateCategory,
} = require("./categoies.controller");

const router = Router();
const requireCatalogManager = [requireAuth, authorize(Roles.ADMIN, Roles.MODERATOR)];

router.get("/", optionalAuth, listCategories);
router.post("/", ...requireCatalogManager, createCategory);
router.get("/:id", optionalAuth, getCategory);
router.patch("/:id", ...requireCatalogManager, updateCategory);
router.delete("/:id", ...requireCatalogManager, deleteCategory);

module.exports = router;
