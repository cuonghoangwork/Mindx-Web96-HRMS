import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Button from "../components/Button";

function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, publicRegistration, configLoading } = useAuth();
  const [email, setEmail] = useState("admin@hrms.com");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Get the page user was trying to access
  const from = location.state?.from?.pathname || "/dashboard";
  const justRegistered = location.state?.justRegistered;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    const result = await login(email, password);
    setIsLoading(false);

    if (result.success) {
      navigate(result.mustChangePassword ? "/change-password" : from, { replace: true });
    } else {
      setError(result.error);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <h1>Welcome Back</h1>
        </div>
        <p className="login-subtitle">Sign in to access your HRMS dashboard</p>

        {justRegistered && (
          <div
            style={{
              marginBottom: "20px", padding: "var(--sp-3) var(--sp-4)",
              background: "var(--bg-success-subtle)", border: "1px solid var(--bdr-success)",
              borderRadius: "var(--radius-md)", color: "var(--txt-success)",
              fontSize: "var(--fs-sm)", display: "flex", alignItems: "center", gap: "var(--sp-2)",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
            Account created. Sign in with the demo credentials below to continue.
          </div>
        )}

        {error && (
          <div className="form-error" style={{ marginBottom: "20px" }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@hrms.com"
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>

          <div className="login-form-options">
            <label className="login-remember">
              <input type="checkbox" />
              <span>Remember me</span>
            </label>
            <Link to="/forgot-password" className="link-primary">
              Forgot password?
            </Link>
          </div>

          <Button
            variant="primary"
            type="submit"
            style={{ width: "100%" }}
            disabled={isLoading}
          >
            {isLoading ? "Signing In..." : "Sign In"}
          </Button>
        </form>

        {!configLoading && publicRegistration && (
          <p style={{ textAlign: "center", marginTop: "24px", fontSize: "14px" }}>
            Don't have an account?{" "}
            <Link to="/register" className="link-primary">
              Create one
            </Link>
          </p>
        )}

        <div className="login-demo-credentials">
          <p>
            <strong>Demo Credentials:</strong>
            <br />
            Email: admin@hrms.com
            <br />
            Password: admin123
          </p>
        </div>
      </div>
    </div>
  );
}

export default Login;
