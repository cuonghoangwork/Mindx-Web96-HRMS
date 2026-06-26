import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import UserModel from "../model/User.js";
import { signTokens } from "../utils/tokens.js";
import { logAction } from "../utils/auditLog.js";

const SALT_ROUNDS = 10;
const SELF_REGISTERABLE_ROLES = ["EMPLOYEE", "MANAGER"];

const authController = {
  register: async (req, res) => {
    try {
      const { email, password, name, role } = req.body;
      if (!email)    throw new Error("email is required!");
      if (!password) throw new Error("password is required!");
      if (!name)     throw new Error("name is required!");

      const existing = await UserModel.findOne({ email: email.toLowerCase() });
      if (existing) throw new Error("An account with this email already exists.");

      const salt    = bcrypt.genSaltSync(SALT_ROUNDS);
      const hash    = bcrypt.hashSync(password, salt);
      const safeRole = SELF_REGISTERABLE_ROLES.includes(role) ? role : "EMPLOYEE";

      const newUser = await UserModel.create({
        email: email.toLowerCase(),
        password: hash,
        name,
        role: safeRole,
      });

      // Use a synthetic req.user so logAction captures the new account itself
      const fakeReq = { user: { id: newUser._id, name: newUser.name, role: newUser.role } };
      await logAction(fakeReq, {
        action:     "registered",
        resource:   "user",
        resourceId: newUser._id,
        label:      `${newUser.name} (${newUser.email})`,
      });

      res.status(201).json({
        success: true,
        data: { id: newUser._id, email: newUser.email, name: newUser.name, role: newUser.role },
        message: "Account created successfully.",
      });
    } catch (error) {
      res.status(400).json({ success: false, data: null, message: error.message });
    }
  },

  login: async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) throw new Error("email and password are required.");

      const user = await UserModel.findOne({ email: email.toLowerCase() });
      if (!user) return res.status(400).json({ success: false, message: "Email or password is incorrect." });

      const isMatch = bcrypt.compareSync(password, user.password);
      if (!isMatch) return res.status(400).json({ success: false, message: "Email or password is incorrect." });

      const { access_token, refresh_token } = signTokens({ id: user._id, email: user.email, role: user.role });
      user.refreshToken = refresh_token;
      await user.save();

      // logAction needs req.user — build it from the just-authenticated user
      const fakeReq = { user: { id: user._id, name: user.name, role: user.role } };
      await logAction(fakeReq, {
        action:     "login",
        resource:   "user",
        resourceId: user._id,
        label:      `${user.name} (${user.email})`,
      });

      res.json({
        success: true,
        data: {
          access_token,
          refresh_token,
          user: { id: user._id, email: user.email, name: user.name, role: user.role },
        },
      });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  },

  refreshToken: async (req, res) => {
    try {
      const { refresh_token } = req.body;
      if (!refresh_token) return res.status(401).json({ success: false, message: "No refresh token provided." });

      let decoded;
      try {
        decoded = jwt.verify(refresh_token, process.env.RT_SECRETKEY);
      } catch {
        return res.status(401).json({ success: false, message: "Refresh token is invalid or expired." });
      }
      if (decoded.tokenType !== "RT") return res.status(401).json({ success: false, message: "Invalid token type." });

      const user = await UserModel.findById(decoded.id);
      if (!user || user.refreshToken !== refresh_token) {
        return res.status(401).json({ success: false, message: "Refresh token is no longer valid." });
      }

      const { access_token, refresh_token: new_refresh_token } = signTokens({ id: user._id, email: user.email, role: user.role });
      user.refreshToken = new_refresh_token;
      await user.save();

      res.json({ success: true, data: { access_token, refresh_token: new_refresh_token } });
    } catch (error) {
      res.status(401).json({ success: false, message: error.message });
    }
  },

  logout: async (req, res) => {
    try {
      const user = await UserModel.findByIdAndUpdate(req.user.id, { refreshToken: null });

      await logAction(req, {
        action:     "logout",
        resource:   "user",
        resourceId: req.user.id,
        label:      user ? `${user.name} (${user.email})` : req.user.id,
      });

      res.json({ success: true, message: "Logged out." });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  me: async (req, res) => {
    try {
      const user = await UserModel.findById(req.user.id).select("-password -refreshToken");
      if (!user) throw new Error("User not found.");
      res.json({ success: true, data: { id: user._id, email: user.email, name: user.name, role: user.role } });
    } catch (error) {
      res.status(404).json({ success: false, message: error.message });
    }
  },
};

export default authController;
