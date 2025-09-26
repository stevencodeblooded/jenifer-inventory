// backend/src/routes/index.js - Fault-tolerant version with error detection
const router = require("express").Router();

// Log function for debugging
const log = (msg) =>
  console.log(`[ROUTES] ${new Date().toISOString()} - ${msg}`);

// Health check route (always works)
router.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "JennySaleFlow API is running",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// API version info (always works)
router.get("/version", (req, res) => {
  res.json({
    success: true,
    version: process.env.npm_package_version || "1.0.0",
    api: "v1",
  });
});

// Track which modules loaded successfully
const moduleStatus = {
  authRoutes: false,
  userRoutes: false,
  productRoutes: false,
  saleRoutes: false,
  orderRoutes: false,
  customerRoutes: false,
  reportRoutes: false,
  dashboardController: false,
  activityController: false,
  auth: false,
  errorHandler: false,
  models: false,
};

// Load route modules with individual error handling
let authRoutes,
  userRoutes,
  productRoutes,
  saleRoutes,
  orderRoutes,
  customerRoutes,
  reportRoutes;

// Auth Routes
try {
  authRoutes = require("./authRoutes");
  router.use("/auth", authRoutes);
  moduleStatus.authRoutes = true;
  log("Auth routes loaded successfully");
} catch (error) {
  log(`Auth routes FAILED: ${error.message}`);

  // Provide fallback auth routes
  router.post("/auth/login", (req, res) => {
    res.status(503).json({
      success: false,
      message: "Auth service temporarily unavailable",
      error: "Route module failed to load",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  });

  router.post("/auth/register", (req, res) => {
    res.status(503).json({
      success: false,
      message: "Registration service temporarily unavailable",
    });
  });
}

// User Routes
try {
  userRoutes = require("./userRoutes");
  router.use("/users", userRoutes);
  moduleStatus.userRoutes = true;
  log("User routes loaded successfully");
} catch (error) {
  log(`User routes FAILED: ${error.message}`);

  router.get("/users", (req, res) => {
    res.status(503).json({
      success: false,
      message: "User service temporarily unavailable",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  });
}

// Product Routes
try {
  productRoutes = require("./productRoutes");
  router.use("/products", productRoutes);
  moduleStatus.productRoutes = true;
  log("Product routes loaded successfully");
} catch (error) {
  log(`Product routes FAILED: ${error.message}`);

  router.get("/products", (req, res) => {
    res.status(503).json({
      success: false,
      message: "Product service temporarily unavailable",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  });
}

// Sale Routes (likely problematic due to M-Pesa)
try {
  saleRoutes = require("./saleRoutes");
  router.use("/sales", saleRoutes);
  moduleStatus.saleRoutes = true;
  log("Sale routes loaded successfully");
} catch (error) {
  log(`Sale routes FAILED: ${error.message}`);

  router.get("/sales", (req, res) => {
    res.status(503).json({
      success: false,
      message: "Sales service temporarily unavailable",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  });

  router.post("/sales", (req, res) => {
    res.status(503).json({
      success: false,
      message: "Sales creation temporarily unavailable",
    });
  });
}

// Order Routes
try {
  orderRoutes = require("./orderRoutes");
  router.use("/orders", orderRoutes);
  moduleStatus.orderRoutes = true;
  log("Order routes loaded successfully");
} catch (error) {
  log(`Order routes FAILED: ${error.message}`);

  router.get("/orders", (req, res) => {
    res.status(503).json({
      success: false,
      message: "Order service temporarily unavailable",
    });
  });
}

// Customer Routes
try {
  customerRoutes = require("./customerRoutes");
  router.use("/customers", customerRoutes);
  moduleStatus.customerRoutes = true;
  log("Customer routes loaded successfully");
} catch (error) {
  log(`Customer routes FAILED: ${error.message}`);

  router.get("/customers", (req, res) => {
    res.status(503).json({
      success: false,
      message: "Customer service temporarily unavailable",
    });
  });
}

// Report Routes
try {
  reportRoutes = require("./reportRoutes");
  router.use("/reports", reportRoutes);
  moduleStatus.reportRoutes = true;
  log("Report routes loaded successfully");
} catch (error) {
  log(`Report routes FAILED: ${error.message}`);

  router.get("/reports", (req, res) => {
    res.status(503).json({
      success: false,
      message: "Report service temporarily unavailable",
    });
  });
}

// Load controllers and middleware with error handling
let dashboardController,
  activityController,
  authenticate,
  checkPermission,
  Category,
  Settings,
  asyncHandler;

// Dashboard Controller
try {
  dashboardController = require("../controllers/dashboardController");
  moduleStatus.dashboardController = true;
  log("Dashboard controller loaded successfully");
} catch (error) {
  log(`Dashboard controller FAILED: ${error.message}`);
}

// Activity Controller
try {
  activityController = require("../controllers/activityController");
  moduleStatus.activityController = true;
  log("Activity controller loaded successfully");
} catch (error) {
  log(`Activity controller FAILED: ${error.message}`);
}

// Auth Middleware
try {
  const authMiddleware = require("../middleware/auth");
  authenticate = authMiddleware.authenticate;
  checkPermission = authMiddleware.checkPermission;
  moduleStatus.auth = true;
  log("Auth middleware loaded successfully");
} catch (error) {
  log(`Auth middleware FAILED: ${error.message}`);

  // Provide fallback middleware
  authenticate = (req, res, next) => {
    res.status(503).json({
      success: false,
      message: "Authentication service unavailable",
    });
  };

  checkPermission = () => authenticate;
}

// Error Handler
try {
  const errorHandlerModule = require("../middleware/errorHandler");
  asyncHandler = errorHandlerModule.asyncHandler;
  moduleStatus.errorHandler = true;
  log("Error handler loaded successfully");
} catch (error) {
  log(`Error handler FAILED: ${error.message}`);

  // Provide fallback asyncHandler
  asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Models
try {
  Category = require("../models/Category");
  Settings = require("../models/Settings");
  moduleStatus.models = true;
  log("Models loaded successfully");
} catch (error) {
  log(`Models FAILED: ${error.message}`);
}

// Dashboard routes (only if controller loaded)
if (dashboardController && authenticate) {
  try {
    router.use("/dashboard", authenticate);
    router.get("/dashboard/overview", dashboardController.getOverview);
    router.get("/dashboard/realtime", dashboardController.getRealtimeStats);
    router.get("/dashboard/sales-chart", dashboardController.getSalesChart);
    router.get("/dashboard/top-products", dashboardController.getTopProducts);
    router.get("/dashboard/low-stock", dashboardController.getLowStockAlerts);
    router.get(
      "/dashboard/performance",
      checkPermission("reports", "view"),
      dashboardController.getPerformanceMetrics
    );
    router.get(
      "/dashboard/notifications",
      dashboardController.getNotifications
    );
    log("Dashboard routes configured successfully");
  } catch (error) {
    log(`Dashboard routes configuration FAILED: ${error.message}`);
  }
} else {
  router.get("/dashboard/*", (req, res) => {
    res.status(503).json({
      success: false,
      message: "Dashboard service temporarily unavailable",
    });
  });
}

// Activity routes (only if controller loaded)
if (activityController && authenticate) {
  try {
    router.use("/activities", authenticate);
    router.get(
      "/activities",
      checkPermission("users", "manage"),
      activityController.getActivities
    );
    router.get(
      "/activities/summary",
      checkPermission("users", "manage"),
      activityController.getActivitySummary
    );
    router.get(
      "/activities/user/:userId",
      activityController.getUserActivitySummary
    );
    router.get(
      "/activities/security",
      checkPermission("users", "manage"),
      activityController.getSecurityEvents
    );
    router.get(
      "/activities/stats",
      checkPermission("users", "manage"),
      activityController.getActivityStats
    );
    router.post(
      "/activities/export",
      checkPermission("reports", "export"),
      activityController.exportActivities
    );
    log("Activity routes configured successfully");
  } catch (error) {
    log(`Activity routes configuration FAILED: ${error.message}`);
  }
} else {
  router.get("/activities/*", (req, res) => {
    res.status(503).json({
      success: false,
      message: "Activity service temporarily unavailable",
    });
  });
}

// Category routes (only if model and middleware loaded)
if (Category && authenticate && asyncHandler) {
  try {
    router.use("/categories", authenticate);

    router.get(
      "/categories",
      checkPermission("products", "read"),
      asyncHandler(async (req, res) => {
        const categories = await Category.find({ isActive: true })
          .populate("parent", "name")
          .sort("displayOrder name");

        res.json({
          success: true,
          data: categories,
        });
      })
    );

    router.get(
      "/categories/tree",
      checkPermission("products", "read"),
      asyncHandler(async (req, res) => {
        const tree = await Category.getCategoryTree();
        res.json({
          success: true,
          data: tree,
        });
      })
    );

    router.post(
      "/categories",
      checkPermission("products", "create"),
      asyncHandler(async (req, res) => {
        req.body.metadata = { createdBy: req.user._id };
        const category = await Category.create(req.body);

        res.status(201).json({
          success: true,
          message: "Category created successfully",
          data: category,
        });
      })
    );

    router.put(
      "/categories/:id",
      checkPermission("products", "update"),
      asyncHandler(async (req, res) => {
        const category = await Category.findByIdAndUpdate(
          req.params.id,
          req.body,
          {
            new: true,
            runValidators: true,
          }
        );

        if (!category) {
          return res.status(404).json({
            success: false,
            message: "Category not found",
          });
        }

        res.json({
          success: true,
          message: "Category updated successfully",
          data: category,
        });
      })
    );

    log("Category routes configured successfully");
  } catch (error) {
    log(`Category routes configuration FAILED: ${error.message}`);
  }
} else {
  router.get("/categories", (req, res) => {
    res.status(503).json({
      success: false,
      message: "Category service temporarily unavailable",
    });
  });
}

// Settings routes (only if model and middleware loaded)
if (Settings && authenticate && asyncHandler) {
  try {
    router.use("/settings", authenticate);

    router.get(
      "/settings",
      asyncHandler(async (req, res) => {
        const settings = await Settings.getSettings();

        if (req.user.role !== "owner") {
          delete settings.security;
          delete settings.integrations;
          delete settings.notifications.email.settings;
          delete settings.notifications.sms.settings;
        }

        res.json({
          success: true,
          data: settings,
        });
      })
    );

    router.put(
      "/settings",
      checkPermission("users", "manage"),
      asyncHandler(async (req, res) => {
        const settings = await Settings.updateSettings(req.body, req.user._id);

        res.json({
          success: true,
          message: "Settings updated successfully",
          data: settings,
        });
      })
    );

    log("Settings routes configured successfully");
  } catch (error) {
    log(`Settings routes configuration FAILED: ${error.message}`);
  }
} else {
  router.get("/settings", (req, res) => {
    res.status(503).json({
      success: false,
      message: "Settings service temporarily unavailable",
    });
  });
}

// Debug endpoint to show what's loaded
router.get("/debug/status", (req, res) => {
  res.json({
    success: true,
    message: "Route loading status",
    moduleStatus,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// Catch-all route for undefined endpoints
router.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
    availableServices: Object.keys(moduleStatus).filter(
      (key) => moduleStatus[key]
    ),
    unavailableServices: Object.keys(moduleStatus).filter(
      (key) => !moduleStatus[key]
    ),
  });
});

// Log final status
log(
  `Route loading completed. Successful: ${Object.values(moduleStatus).filter(Boolean).length}/${Object.keys(moduleStatus).length}`
);

module.exports = router;