const express = require("express");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const User = require("../models/User");
const { protect } = require("../middleware/auth");
const { issueCsrfToken, verifyCsrfToken } = require("../middleware/csrf");
const { sendSuccess, sendError } = require("../utils/response");
const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  handler: (req, res) =>
    sendError(res, 429, "Too many attempts, please try again later."),
});

// sameSite "strict" was blocking the cookie on every cross-origin request
// (frontend on :3000, backend on :5000 = different origins). "lax" allows
// it in dev; "none" (+ secure) is needed in prod if frontend/backend are
// on different domains, e.g. Vercel frontend -> separate API host.
const cookieBaseOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
};

const signAccessToken = (id, userType) =>
  jwt.sign({ id, userType }, process.env.JWT_SECRET, { expiresIn: "2d" });

const signRefreshToken = (id) =>
  jwt.sign({ id }, process.env.JWT_REFRESH_SECRET, { expiresIn: "7d" });

const setAuthCookies = (res, user) => {
  const accessToken = signAccessToken(user._id, user.userType);
  const refreshToken = signRefreshToken(user._id);

  res.cookie("accessToken", accessToken, {
    ...cookieBaseOptions,
    maxAge: 2 * 24 * 60 * 60 * 1000,
  });
  res.cookie("refreshToken", refreshToken, {
    ...cookieBaseOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name: { type: string }
 *               email: { type: string }
 *               password: { type: string }
 *               userType: { type: string, enum: [user, vendor] }
 *     responses:
 *       201:
 *         description: Account created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Email already in use
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  "/register",
  authLimiter,
  issueCsrfToken,
  async (req, res, next) => {
    try {
      const { name, email, password, userType } = req.body;

      if (!name || !email || !password)
        return sendError(res, 400, "All fields required");

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email))
        return sendError(res, 400, "Invalid email format");

      if (password.length < 6)
        return sendError(res, 400, "Password must be at least 6 characters");

      const publicTypes = ["user", "vendor"];
      const resolvedType = publicTypes.includes(userType) ? userType : "user";

      const exists = await User.findOne({ email });
      if (exists) return sendError(res, 409, "Email already in use");

      const user = await User.create({
        name,
        email,
        password,
        userType: resolvedType,
      });

      setAuthCookies(res, user);

      sendSuccess(res, 201, "Account created", {
        csrfToken: req.csrfToken,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          userType: user.userType,
          isVerified: user.isVerified,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Log in a user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Logged in
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Missing fields
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/login", authLimiter, issueCsrfToken, async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return sendError(res, 400, "Email and password required");

    const user = await User.findOne({ email });
    if (!user || !(await user.matchPassword(password)))
      return sendError(res, 401, "Invalid credentials");

    setAuthCookies(res, user);

    sendSuccess(res, 200, "Logged in", {
      csrfToken: req.csrfToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        userType: user.userType,
        isVerified: user.isVerified,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/auth/verify-email/{token}:
 *   get:
 *     summary: Verify a user's email via token
 *     tags: [Auth]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Email verified
 *       400:
 *         description: Invalid or expired verification link
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/verify-email/:token", async (req, res, next) => {
  try {
    const hashedToken = crypto
      .createHash("sha256")
      .update(req.params.token)
      .digest("hex");

    const user = await User.findOne({
      verificationToken: hashedToken,
      verificationTokenExpires: { $gt: Date.now() },
    });

    if (!user)
      return sendError(res, 400, "Invalid or expired verification link");

    user.isVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpires = undefined;
    await user.save();

    sendSuccess(res, 200, "Email verified");
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Refresh the access token using the refresh token cookie
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Token refreshed
 *       401:
 *         description: Invalid or expired refresh token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/refresh", async (req, res) => {
  const token = req.cookies?.refreshToken;
  if (!token) return sendError(res, 401, "Not authorized");

  try {
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.id).select("-password");
    if (!user) return sendError(res, 401, "User no longer exists");

    const accessToken = signAccessToken(user._id, user.userType);
    res.cookie("accessToken", accessToken, {
      ...cookieBaseOptions,
      maxAge: 2 * 24 * 60 * 60 * 1000,
    });

    sendSuccess(res, 200, "Token refreshed");
  } catch {
    sendError(res, 401, "Invalid or expired refresh token");
  }
});

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Log out the current user
 *     tags: [Auth]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Logged out
 *       403:
 *         description: Invalid CSRF token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/logout", verifyCsrfToken, protect, (req, res) => {
  res.clearCookie("accessToken", cookieBaseOptions);
  res.clearCookie("refreshToken", cookieBaseOptions);
  res.clearCookie("csrfToken");
  sendSuccess(res, 200, "Logged out");
});

module.exports = router;
