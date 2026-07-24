import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import UserModel from "../model/User.js";
import EmployeeModel from "../model/Employee.js";
import { signTokens } from "../utils/tokens.js";
import { notifyHR } from "./notificationController.js";
import { publicRegistrationEnabled, accountEmailDomain } from "../middleware/registrationGate.js";

const SALT_ROUNDS = 10;

const authController = {
  config: (req, res) => {
    res.json({
      success: true,
      data: {
        publicRegistration: publicRegistrationEnabled(),
        accountEmailDomain: accountEmailDomain(),
      },
    });
  },

  register: async (req, res) => {
    try {
      const { email, password, name } = req.body;
      if (!email) throw new Error("email is required!");
      if (!password) throw new Error("password is required!");
      if (!name) throw new Error("name is required!");
      if (password.length < 8) throw new Error("Password must be at least 8 characters.");

      const existing = await UserModel.findOne({ email: email.toLowerCase() });
      if (existing) throw new Error("An account with this email already exists.");

      const salt = bcrypt.genSaltSync(SALT_ROUNDS);
      const hash = bcrypt.hashSync(password, salt);

      const newUser = await UserModel.create({
        email: email.toLowerCase(),
        password: hash,
        name,
        role: "EMPLOYEE", // always — no self-promotion
      });

      // Attempt to link to an existing Employee record with the same email
      const empMatch = await EmployeeModel.findOne({ email: email.toLowerCase() });
      if (empMatch && !empMatch.userId) {
        empMatch.userId = newUser._id;
        await empMatch.save();
        newUser.employee = empMatch._id;
        await newUser.save();
      }

      notifyHR({
        title: "New account registered",
        message: `${newUser.name} (${newUser.email}) created an Employee account.`,
        category: "employee",
        link: "/settings",
        linkLabel: "Manage user roles",
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
      if (!user) {
        return res.status(400).json({ success: false, message: "Email or password is incorrect." });
      }

      const isMatch = bcrypt.compareSync(password, user.password);
      if (!isMatch) {
        return res.status(400).json({ success: false, message: "Email or password is incorrect." });
      }

      const mustChangePassword = Boolean(user.mustChangePassword);
      const { access_token, refresh_token } = signTokens({
        id: user._id,
        email: user.email,
        role: user.role,
        mustChangePassword,
      });

      user.refreshToken = refresh_token;
      await user.save();

      res.json({
        success: true,
        data: {
          access_token,
          refresh_token,
          user: {
            id: user._id,
            email: user.email,
            name: user.name,
            role: user.role,
            employeeId: user.employee ? String(user.employee) : null,
            mustChangePassword,
          },
        },
      });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  },

  refreshToken: async (req, res) => {
    try {
      const { refresh_token } = req.body;
      if (!refresh_token) {
        return res.status(401).json({ success: false, message: "No refresh token provided." });
      }

      let decoded;
      try {
        decoded = jwt.verify(refresh_token, process.env.RT_SECRETKEY);
      } catch {
        return res.status(401).json({ success: false, message: "Refresh token is invalid or expired." });
      }
      if (decoded.tokenType !== "RT") {
        return res.status(401).json({ success: false, message: "Invalid token type." });
      }

      const user = await UserModel.findById(decoded.id);
      if (!user || user.refreshToken !== refresh_token) {
        return res.status(401).json({ success: false, message: "Refresh token is no longer valid." });
      }

      const { access_token, refresh_token: new_refresh_token } = signTokens({
        id: user._id,
        email: user.email,
        role: user.role,
        mustChangePassword: Boolean(user.mustChangePassword),
      });

      user.refreshToken = new_refresh_token;
      await user.save();

      res.json({ success: true, data: { access_token, refresh_token: new_refresh_token } });
    } catch (error) {
      res.status(401).json({ success: false, message: error.message });
    }
  },

  logout: async (req, res) => {
    try {
      await UserModel.findByIdAndUpdate(req.user.id, { refreshToken: null });
      res.json({ success: true, message: "Logged out." });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  me: async (req, res) => {
    try {
      const user = await UserModel.findById(req.user.id).select("-password -refreshToken");
      if (!user) throw new Error("User not found.");
      res.json({
        success: true,
        data: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
          employeeId: user.employee ? String(user.employee) : null,
          mustChangePassword: Boolean(user.mustChangePassword),
        },
      });
    } catch (error) {
      res.status(404).json({ success: false, message: error.message });
    }
  },

  changePassword: async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword) throw new Error("currentPassword is required.");
      if (!newPassword) throw new Error("newPassword is required.");
      if (newPassword.length < 8) {
        throw new Error("New password must be at least 8 characters.");
      }
      if (newPassword === currentPassword) {
        throw new Error("New password must be different from the current password.");
      }

      const user = await UserModel.findById(req.user.id);
      if (!user) throw new Error("User not found.");

      if (!bcrypt.compareSync(currentPassword, user.password)) {
        return res
          .status(400)
          .json({ success: false, message: "Current password is incorrect." });
      }

      const salt = bcrypt.genSaltSync(SALT_ROUNDS);
      user.password = bcrypt.hashSync(newPassword, salt);
      user.mustChangePassword = false;

      const { access_token, refresh_token } = signTokens({
        id: user._id,
        email: user.email,
        role: user.role,
        mustChangePassword: false,
      });
      user.refreshToken = refresh_token;
      await user.save();

      res.json({
        success: true,
        message: "Password updated.",
        data: {
          access_token,
          refresh_token,
          user: {
            id: user._id,
            email: user.email,
            name: user.name,
            role: user.role,
            employeeId: user.employee ? String(user.employee) : null,
            mustChangePassword: false,
          },
        },
      });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  },

  // GET /api/v1/auth/users — ADMIN only: list all accounts with their roles
  listUsers: async (req, res) => {
    try {
      const users = await UserModel.find({}, "-password -refreshToken").sort({ createdAt: -1 });
      res.json({
        success: true,
        items: users.map((u) => ({
          id: u._id,
          email: u.email,
          name: u.name,
          role: u.role,
          employeeId: u.employee ? String(u.employee) : null,
          mustChangePassword: Boolean(u.mustChangePassword),
          createdAt: u.createdAt,
        })),
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // PATCH /api/v1/auth/users/:id/promote — ADMIN only
  promote: async (req, res) => {
    try {
      const { role } = req.body;
      if (!["EMPLOYEE", "MANAGER", "ADMIN"].includes(role)) {
        return res.status(400).json({
          success: false,
          message: "role must be one of EMPLOYEE, MANAGER or ADMIN.",
        });
      }

      const target = await UserModel.findById(req.params.id);
      if (!target) throw new Error("User not found.");

      if (String(target._id) === String(req.user.id)) {
        return res.status(403).json({
          success: false,
          message: "You cannot change your own role.",
        });
      }

      if (target.role === role) {
        return res.json({
          success: true,
          message: `${target.name} is already ${role}.`,
          data: { id: target._id, email: target.email, name: target.name, role: target.role },
        });
      }

      const LABELS = {
        EMPLOYEE: "set back to Employee",
        MANAGER: "promoted to HR/Manager",
        ADMIN: "promoted to Administrator",
      };

      target.role = role;
      await target.save();

      res.json({
        success: true,
        message: `${target.name} has been ${LABELS[role]}.`,
        data: { id: target._id, email: target.email, name: target.name, role: target.role },
      });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  },
};

export default authController;
