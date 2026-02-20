import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import AuthShell from "../components/layout/AuthShell";
import InputField from "../components/ui/InputField";
import Button from "../components/ui/Button";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";

function validateLogin(values) {
  const errors = {};
  if (!values.email.trim()) errors.email = "Email is required.";
  if (!/\S+@\S+\.\S+/.test(values.email)) errors.email = "Enter a valid email.";
  if (!values.password) errors.password = "Password is required.";
  if (values.password.length < 6) errors.password = "Password must be at least 6 characters.";
  return errors;
}

function LoginPage() {
  const { login } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = useMemo(() => location.state?.from?.pathname || "/dashboard", [location]);

  const [values, setValues] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const onChange = (event) => {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: "" }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = validateLogin(values);
    setErrors(nextErrors);
    setFormError("");
    if (Object.keys(nextErrors).length) return;

    setIsSubmitting(true);
    try {
      await login(values);
      showToast({
        type: "success",
        title: "Signed in",
        message: "You have logged in securely.",
      });
      navigate(redirectTo, { replace: true });
    } catch (error) {
      setFormError(error.message || "Login failed.");
      showToast({
        type: "error",
        title: "Login Failed",
        message: error.message || "Invalid credentials.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Secure Login"
      subtitle="Access your AI-powered skin analysis dashboard."
      footer={
        <p className="text-slate-600 dark:text-slate-300">
          No account?{" "}
          <Link className="font-semibold text-medicalBlue hover:underline" to="/signup">
            Create one
          </Link>
        </p>
      }
    >
      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        <InputField
          id="email"
          name="email"
          type="email"
          label="Email Address"
          value={values.email}
          onChange={onChange}
          placeholder="doctor@clinic.com"
          error={errors.email}
        />
        <InputField
          id="password"
          name="password"
          type="password"
          label="Password"
          value={values.password}
          onChange={onChange}
          placeholder="••••••••"
          error={errors.password}
        />

        {formError ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            {formError}
          </p>
        ) : null}

        <Button type="submit" className="w-full" loading={isSubmitting}>
          Log In
        </Button>
      </form>
    </AuthShell>
  );
}

export default LoginPage;
