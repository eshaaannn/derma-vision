import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthShell from "../components/layout/AuthShell";
import InputField from "../components/ui/InputField";
import Button from "../components/ui/Button";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";

function validateSignup(values) {
  const errors = {};
  if (!values.fullName.trim()) errors.fullName = "Full name is required.";
  if (!values.email.trim()) errors.email = "Email is required.";
  if (!/\S+@\S+\.\S+/.test(values.email)) errors.email = "Enter a valid email.";
  if (!values.password) errors.password = "Password is required.";
  if (values.password.length < 6) errors.password = "Minimum 6 characters required.";
  if (values.confirmPassword !== values.password) {
    errors.confirmPassword = "Passwords do not match.";
  }
  return errors;
}

function SignupPage() {
  const { signup } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [values, setValues] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
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
    const nextErrors = validateSignup(values);
    setErrors(nextErrors);
    setFormError("");
    if (Object.keys(nextErrors).length) return;

    setIsSubmitting(true);
    try {
      await signup(values);
      showToast({
        type: "success",
        title: "Account Created",
        message: "Your Derma Vision account is ready.",
      });
      navigate("/dashboard", { replace: true });
    } catch (error) {
      setFormError(error.message || "Sign up failed.");
      showToast({
        type: "error",
        title: "Signup Failed",
        message: error.message || "Could not create account.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Create Account"
      subtitle="Start your secure AI-based skin screening journey."
      footer={
        <p className="text-slate-600 dark:text-slate-300">
          Already have an account?{" "}
          <Link className="font-semibold text-medicalBlue hover:underline" to="/login">
            Log in
          </Link>
        </p>
      }
    >
      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        <InputField
          id="fullName"
          name="fullName"
          label="Full Name"
          value={values.fullName}
          onChange={onChange}
          placeholder="Sahil Thote"
          error={errors.fullName}
        />
        <InputField
          id="email"
          name="email"
          type="email"
          label="Email Address"
          value={values.email}
          onChange={onChange}
          placeholder="you@example.com"
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
        <InputField
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          label="Confirm Password"
          value={values.confirmPassword}
          onChange={onChange}
          placeholder="••••••••"
          error={errors.confirmPassword}
        />

        {formError ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            {formError}
          </p>
        ) : null}

        <Button type="submit" className="w-full" loading={isSubmitting}>
          Create Account
        </Button>
      </form>
    </AuthShell>
  );
}

export default SignupPage;
