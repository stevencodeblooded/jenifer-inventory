// backend/src/middleware/rateLimiter.js - Serverless Compatible Version
const rateLimit = require("express-rate-limit");

// Try to import Redis modules, but don't fail if they're not available
let redisClient = null;
let RedisStore = null;

// Only attempt Redis import if Redis URL is provided
if (process.env.REDIS_URL) {
  try {
    const Redis = require("ioredis");
    const RedisStoreModule = require("rate-limit-redis");

    redisClient = new Redis(process.env.REDIS_URL);
    RedisStore = RedisStoreModule.default || RedisStoreModule;

    redisClient.on("error", (err) => {
      console.error("Redis connection error:", err);
      redisClient = null;
      RedisStore = null;
    });

    console.log("Redis rate limiter store initialized");
  } catch (error) {
    console.log("Redis not available, using memory store for rate limiting");
    redisClient = null;
    RedisStore = null;
  }
} else {
  console.log("No Redis URL provided, using memory store for rate limiting");
}

// Create different rate limiters for different endpoints
const createLimiter = (options) => {
  const config = {
    windowMs: 15 * 60 * 1000, // 15 minutes default
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests, please try again later.",
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        message:
          options.message || "Too many requests, please try again later.",
        retryAfter: Math.round(req.rateLimit.resetTime / 1000) || 60,
      });
    },
    ...options,
  };

  // Use Redis store if available, otherwise use memory store (default)
  if (redisClient && RedisStore) {
    try {
      config.store = new RedisStore({
        sendCommand: (...args) => redisClient.call(...args),
        prefix: "rl:",
      });
      console.log("Using Redis store for rate limiting");
    } catch (error) {
      console.log("Failed to create Redis store, using memory store");
    }
  }

  return rateLimit(config);
};

// General API rate limiter (more lenient for serverless)
const apiLimiter = createLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Increased limit for serverless
  message: "Too many API requests, please try again later.",
  skip: (req) => {
    // Skip rate limiting for certain IPs if specified
    const whitelist = process.env.RATE_LIMIT_WHITELIST?.split(",") || [];
    return whitelist.includes(req.ip);
  },
});

// Auth rate limiter (lenient for development)
const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === "production" ? 10 : 100, // More lenient in development
  message: "Too many authentication attempts, please try again later.",
  skipSuccessfulRequests: true,
});

// Password reset limiter
const passwordResetLimiter = createLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: process.env.NODE_ENV === "production" ? 5 : 50,
  message: "Too many password reset requests, please try again later.",
});

// Report generation limiter
const reportLimiter = createLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: process.env.NODE_ENV === "production" ? 20 : 100,
  message: "Report generation limit reached, please try again later.",
});

// Upload limiter
const uploadLimiter = createLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: process.env.NODE_ENV === "production" ? 50 : 200,
  message: "Upload limit reached, please try again later.",
});

// Transaction limiter (very lenient for serverless)
const transactionLimiter = createLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: process.env.NODE_ENV === "production" ? 50 : 500,
  message: "Transaction limit reached, please slow down.",
});

// Dynamic limiter factory
const createDynamicLimiter = (getLimit) => {
  return (req, res, next) => {
    const limit = getLimit(req);

    const limiter = createLimiter({
      windowMs: 15 * 60 * 1000,
      max: limit,
      keyGenerator: (req) => {
        return req.user ? `user:${req.user._id}` : `ip:${req.ip}`;
      },
    });

    limiter(req, res, next);
  };
};

// Role-based limiter
const roleLimiter = createDynamicLimiter((req) => {
  if (!req.user) return 100;

  switch (req.user.role) {
    case "owner":
      return 2000;
    case "operator":
      return 1000;
    case "viewer":
      return 500;
    default:
      return 100;
  }
});

// Endpoint-specific limiter
const endpointLimiter = (endpoint, options = {}) => {
  return createLimiter({
    windowMs: 15 * 60 * 1000,
    max: 100,
    ...options,
    keyGenerator: (req) => {
      const userId = req.user ? req.user._id : req.ip;
      return `${userId}:${endpoint}`;
    },
  });
};

// Burst limiter (simplified for serverless)
const burstLimiter = createLimiter({
  windowMs: 1000, // 1 second
  max: process.env.NODE_ENV === "production" ? 20 : 100,
  message: "Request rate too high, please slow down.",
});

// Sliding window limiter (memory-based for serverless)
const slidingWindowLimiter = (windowMs, max) => {
  const requests = new Map();

  return (req, res, next) => {
    const key = req.user ? `user:${req.user._id}` : `ip:${req.ip}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    if (!requests.has(key)) {
      requests.set(key, []);
    }

    const userRequests = requests.get(key);
    const validRequests = userRequests.filter((time) => time > windowStart);

    if (validRequests.length >= max) {
      const oldestRequest = Math.min(...validRequests);
      const resetTime = oldestRequest + windowMs;

      return res.status(429).json({
        success: false,
        message: "Too many requests",
        retryAfter: Math.ceil((resetTime - now) / 1000),
      });
    }

    validRequests.push(now);
    requests.set(key, validRequests);

    // Cleanup old entries occasionally
    if (Math.random() < 0.01) {
      for (const [k, v] of requests.entries()) {
        if (v.every((time) => time < windowStart)) {
          requests.delete(k);
        }
      }
    }

    next();
  };
};

// Cost-based limiter (simplified)
const costBasedLimiter = (maxCost = 100, windowMs = 60000) => {
  const costs = new Map();

  return (costFunction) => {
    return (req, res, next) => {
      const key = req.user ? `user:${req.user._id}` : `ip:${req.ip}`;
      const now = Date.now();
      const cost = costFunction(req);

      if (!costs.has(key)) {
        costs.set(key, { total: 0, resetTime: now + windowMs });
      }

      const userCost = costs.get(key);

      if (now > userCost.resetTime) {
        userCost.total = 0;
        userCost.resetTime = now + windowMs;
      }

      if (userCost.total + cost > maxCost) {
        return res.status(429).json({
          success: false,
          message: "Rate limit exceeded. Operation too expensive.",
          retryAfter: Math.ceil((userCost.resetTime - now) / 1000),
        });
      }

      userCost.total += cost;
      next();
    };
  };
};

// Report cost limiter
const reportCostLimiter = costBasedLimiter(200, 3600000); // More lenient

const expensiveReportLimiter = reportCostLimiter((req) => {
  const costs = {
    daily: 5,
    weekly: 10,
    monthly: 15,
    yearly: 25,
    custom: 20,
  };
  return costs[req.query.type] || 10;
});

module.exports = {
  apiLimiter,
  authLimiter,
  passwordResetLimiter,
  reportLimiter,
  uploadLimiter,
  transactionLimiter,
  roleLimiter,
  endpointLimiter,
  burstLimiter,
  slidingWindowLimiter,
  costBasedLimiter,
  expensiveReportLimiter,
};
