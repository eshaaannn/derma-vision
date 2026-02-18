import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import Card from "../components/ui/Card";
import InputField from "../components/ui/InputField";
import Button from "../components/ui/Button";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";

function ProfilePage() {
  const { user, updateProfile, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [isSaving, setIsSaving] = useState(false);

  const [form, setForm] = useState({
    fullName: user?.fullName || "",
    email: user?.email || "",
    age: user?.age || "",
    phone: user?.phone || "",
  });

  const avatar = useMemo(() => {
    return (
      user?.avatar ||
      "https://api.dicebear.com/9.x/thumbs/svg?seed=" + encodeURIComponent(form.fullName || "User")
    );
  }, [form.fullName, user?.avatar]);

  const onChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const onSave = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      await updateProfile(form);
      showToast({
        type: "success",
        title: "Profile Updated",
        message: "Your profile details were saved.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const onLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid gap-5 lg:grid-cols-[1fr,1.3fr]"
    >
      <Card className="h-fit text-center">
        <img
          src={avatar}
          alt="User avatar"
          className="mx-auto h-24 w-24 rounded-full border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-800"
        />
        <h2 className="mt-3 text-lg font-extrabold text-slate-900 dark:text-slate-100">{form.fullName}</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">{form.email}</p>
        <div className="mt-5 space-y-2">
          <Button variant="ghost" className="w-full" onClick={toggleTheme}>
            Switch to {isDark ? "Light" : "Dark"} Theme
          </Button>
          <Button variant="danger" className="w-full" onClick={onLogout}>
            Logout
          </Button>
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 text-base font-bold text-slate-900 dark:text-slate-100">Edit Profile</h3>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={onSave}>
          <InputField
            id="fullName"
            name="fullName"
            label="Full Name"
            value={form.fullName}
            onChange={onChange}
          />
          <InputField
            id="email"
            name="email"
            type="email"
            label="Email"
            value={form.email}
            onChange={onChange}
          />
          <InputField
            id="age"
            name="age"
            type="number"
            label="Age"
            value={form.age}
            onChange={onChange}
          />
          <InputField
            id="phone"
            name="phone"
            label="Phone Number"
            value={form.phone}
            onChange={onChange}
          />
          <div className="sm:col-span-2">
            <Button type="submit" loading={isSaving}>
              Save Changes
            </Button>
          </div>
        </form>
      </Card>
    </motion.section>
  );
}

export default ProfilePage;
