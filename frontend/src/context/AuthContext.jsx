import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

const AuthContext = createContext(null);

function mapSupabaseUser(authUser) {
  if (!authUser) return null;

  const metadata = authUser.user_metadata || {};
  const fullName =
    metadata.fullName || metadata.full_name || authUser.email?.split("@")[0] || "User";

  return {
    id: authUser.id,
    fullName,
    email: authUser.email || "",
    avatar:
      metadata.avatar ||
      "https://api.dicebear.com/9.x/thumbs/svg?seed=" + encodeURIComponent(fullName),
    age: metadata.age || "",
    phone: metadata.phone || "",
  };
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function initializeAuth() {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;

      const nextSession = data?.session || null;
      setSession(nextSession);
      setUser(mapSupabaseUser(nextSession?.user || null));
      setIsLoading(false);
    }

    initializeAuth();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession || null);
      setUser(mapSupabaseUser(nextSession?.user || null));
      setIsLoading(false);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signup = async ({ fullName, email, password }) => {
    const normalizedEmail = email.trim().toLowerCase();
    const avatar =
      "https://api.dicebear.com/9.x/thumbs/svg?seed=" + encodeURIComponent(fullName || "User");

    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          fullName: fullName.trim(),
          avatar,
        },
      },
    });

    if (error) {
      throw new Error(error.message || "Sign up failed.");
    }

    if (!data.session) {
      throw new Error("Signup successful. Please verify your email, then log in.");
    }

    return mapSupabaseUser(data.user || data.session.user);
  };

  const login = async ({ email, password }) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      throw new Error(error.message || "Invalid email or password.");
    }

    return mapSupabaseUser(data.user || data.session?.user);
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  const updateProfile = async (profilePayload) => {
    if (!session?.user) return;

    const fullName = profilePayload.fullName?.trim() || user?.fullName || "";
    const avatar =
      profilePayload.avatar ||
      user?.avatar ||
      "https://api.dicebear.com/9.x/thumbs/svg?seed=" + encodeURIComponent(fullName || "User");

    const updatePayload = {
      data: {
        ...(session.user.user_metadata || {}),
        fullName,
        avatar,
        age: profilePayload.age || "",
        phone: profilePayload.phone || "",
      },
    };

    const nextEmail = profilePayload.email?.trim().toLowerCase();
    if (nextEmail && nextEmail !== session.user.email) {
      updatePayload.email = nextEmail;
    }

    const { data, error } = await supabase.auth.updateUser(updatePayload);
    if (error) {
      throw new Error(error.message || "Profile update failed.");
    }

    const nextAuthUser = data.user || {
      ...session.user,
      email: updatePayload.email || session.user.email,
      user_metadata: updatePayload.data,
    };
    setUser(mapSupabaseUser(nextAuthUser));
  };

  const value = useMemo(
    () => ({
      user,
      token: session?.access_token || null,
      isAuthenticated: Boolean(session?.access_token),
      isLoading,
      login,
      signup,
      logout,
      updateProfile,
    }),
    [isLoading, session?.access_token, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
