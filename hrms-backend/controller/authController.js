import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import UserModel from "../model/User.js";
import EmployeeModel from "../model/Employee.js";
import { signTokens } from "../utils/tokens.js";
import { notifyHR } from "../utils/notify.js";
import { publicRegistrationEnabled, accountEmailDomain } from "../middleware/registrationGate.js";
import { AppError } from "../utils/appError.js";

const SALT_ROUNDS = 10;

// Some Employee records end up with `userId` set (e.g.
// employeeController.create's existingUser branch, or a manually-fixed
// record) without the reverse `User.employee` pointer ever being set — the
// sidebar's "My Profile" link (and every self-service feature keyed off
// user.employee) then silently stays broken for that account forever.
// Self-heal here on every login/me/changePassword call, same fallback
// employeeController.getMyProfile already does for its own lookup.
async function resolveEmployeeId(user) {
  if (user.employee) return String(user.employee);
  const employee = await EmployeeModel.findOne({
    $or: [{ userId: user._id }, { email: user.email }],
  });
  if (!employee) return null;
  user.employee = employee._id;
  await user.save();
  if (!employee.userId) {
    employee.userId = user._id;
    await employee.save();
  }
  return String(employee._id);
}

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
      if (!email) throw new AppError("email is required!", "AUTH_EMAIL_REQUIRED");
      if (!password) throw new AppError("password is required!", "PASSWORD_REQUIRED");
      if (!name) throw new AppError("name is required!", "AUTH_NAME_REQUIRED");
      if (password.length < 8) throw new AppError("Password must be at least 8 characters.", "PASSWORD_TOO_SHORT");

      const existing = await UserModel.findOne({ email: email.toLowerCase() });
      if (existing) throw new AppError("An account with this email already exists.", "ACCOUNT_EMAIL_EXISTS");

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
        titleKey: "accountRegistered",
        messageKey: "accountRegistered",
        params: { userName: newUser.name, userEmail: newUser.email },
      });

      res.status(201).json({
        success: true,
        data: { id: newUser._id, email: newUser.email, name: newUser.name, role: newUser.role },
        message: "Account created successfully.",
      });
    } catch (error) {
      res.status(400).json({ success: false, data: null, message: error.message, code: error.code, params: error.params });
    }
  },

  login: async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) throw new AppError("email and password are required.", "EMAIL_AND_PASSWORD_REQUIRED");

      const user = await UserModel.findOne({ email: email.toLowerCase() });
      if (!user) {
        return res.status(400).json({ success: false, message: "Email or password is incorrect.", code: "INVALID_CREDENTIALS" });
      }

      const isMatch = bcrypt.compareSync(password, user.password);
      if (!isMatch) {
        return res.status(400).json({ success: false, message: "Email or password is incorrect.", code: "INVALID_CREDENTIALS" });
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

      const employeeId = await resolveEmployeeId(user);

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
            employeeId,
            mustChangePassword,
          },
        },
      });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },

  refreshToken: async (req, res) => {
    try {
      const { refresh_token } = req.body;
      if (!refresh_token) {
        return res.status(401).json({ success: false, message: "No refresh token provided.", code: "NO_REFRESH_TOKEN" });
      }

      let decoded;
      try {
        decoded = jwt.verify(refresh_token, process.env.RT_SECRETKEY);
      } catch {
        return res.status(401).json({ success: false, message: "Refresh token is invalid or expired.", code: "REFRESH_TOKEN_INVALID" });
      }
      if (decoded.tokenType !== "RT") {
        return res.status(401).json({ success: false, message: "Invalid token type.", code: "INVALID_TOKEN_TYPE" });
      }

      const user = await UserModel.findById(decoded.id);
      if (!user || user.refreshToken !== refresh_token) {
        return res.status(401).json({ success: false, message: "Refresh token is no longer valid.", code: "REFRESH_TOKEN_REVOKED" });
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
      res.status(401).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },

  logout: async (req, res) => {
    try {
      await UserModel.findByIdAndUpdate(req.user.id, { refreshToken: null });
      res.json({ success: true, message: "Logged out." });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },

  me: async (req, res) => {
    try {
      const user = await UserModel.findById(req.user.id).select("-password -refreshToken");
      if (!user) throw new AppError("User not found.", "USER_NOT_FOUND");
      const employeeId = await resolveEmployeeId(user);
      res.json({
        success: true,
        data: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
          employeeId,
          mustChangePassword: Boolean(user.mustChangePassword),
        },
      });
    } catch (error) {
      res.status(404).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },

  changePassword: async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword) throw new AppError("currentPassword is required.", "CURRENT_PASSWORD_REQUIRED");
      if (!newPassword) throw new AppError("newPassword is required.", "NEW_PASSWORD_REQUIRED");
      if (newPassword.length < 8) {
        throw new AppError("New password must be at least 8 characters.", "NEW_PASSWORD_TOO_SHORT");
      }
      if (newPassword === currentPassword) {
        throw new AppError("New password must be different from the current password.", "NEW_PASSWORD_SAME_AS_CURRENT");
      }

      const user = await UserModel.findById(req.user.id);
      if (!user) throw new AppError("User not found.", "USER_NOT_FOUND");

      if (!bcrypt.compareSync(currentPassword, user.password)) {
        return res
          .status(400)
          .json({ success: false, message: "Current password is incorrect.", code: "CURRENT_PASSWORD_INCORRECT" });
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

      const employeeId = await resolveEmployeeId(user);

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
            employeeId,
            mustChangePassword: false,
          },
        },
      });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message, code: error.code, params: error.params });
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
      res.status(500).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },

  // PATCH /api/v1/auth/users/:id/promote — ADMIN only
  promote: async (req, res) => {
    try {
      const { role } = req.body;
      if (!["EMPLOYEE", "MANAGER", "HR", "ADMIN"].includes(role)) {
        return res.status(400).json({
          success: false,
          message: "role must be one of EMPLOYEE, MANAGER, HR or ADMIN.",
          code: "INVALID_ROLE",
        });
      }

      const target = await UserModel.findById(req.params.id);
      if (!target) throw new AppError("User not found.", "USER_NOT_FOUND");

      if (String(target._id) === String(req.user.id)) {
        return res.status(403).json({
          success: false,
          message: "You cannot change your own role.",
          code: "CANNOT_CHANGE_OWN_ROLE",
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
        MANAGER: "promoted to Manager",
        HR: "promoted to HR",
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
      res.status(400).json({ success: false, message: error.message, code: error.code, params: error.params });
    }
  },
};

export default authController;
