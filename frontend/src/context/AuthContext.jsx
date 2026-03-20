import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { fetchProfile, upsertProfile } from "../services/profiles";

const AuthContext = createContext(null);

function mapSupabaseUser(authUser, profile = null) {
  if (!authUser) return null;

  const metadata = authUser.user_metadata || {};
  const fullName =
    profile?.full_name ||
    metadata.fullName ||
    metadata.full_name ||
    authUser.email?.split("@")[0] ||
    "User";

  return {
    id: authUser.id,
    fullName,
    email: profile?.email || authUser.email || "",
    avatar:
      profile?.avatar_url ||
      metadata.avatar ||
      "https://api.dicebear.com/9.x/thumbs/svg?seed=" + encodeURIComponent(fullName),
    age: profile?.age ?? metadata.age ?? "",
    phone: profile?.phone ?? metadata.phone ?? "",
  };
}

function normalizeOptionalNumber(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function syncSession(nextSession) {
      if (!mounted) return;

      setSession(nextSession);
      if (!nextSession?.user) {
        setUser(null);
        setIsLoading(false);
        return;
      }

      try {
        const profile = await fetchProfile(nextSession.user.id);
        if (!mounted) return;
        setUser(mapSupabaseUser(nextSession.user, profile));
      } catch {
        if (!mounted) return;
        setUser(mapSupabaseUser(nextSession.user));
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    async function initializeAuth() {
      const { data } = await supabase.auth.getSession();
      await syncSession(data?.session || null);
    }

    initializeAuth();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void syncSession(nextSession || null);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signup = async ({ fullName, email, password }) => {
    const normalizedEmail = email.trim().toLowerCase();
    const trimmedFullName = fullName.trim();
    const avatar =
      "https://api.dicebear.com/9.x/thumbs/svg?seed=" + encodeURIComponent(trimmedFullName || "User");

    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          fullName: trimmedFullName,
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

    const authUser = data.user || data.session.user;

    try {
      const profile = await fetchProfile(authUser.id);
      return mapSupabaseUser(authUser, profile);
    } catch {
      return mapSupabaseUser(authUser);
    }
  };

  const login = async ({ email, password }) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      throw new Error(error.message || "Invalid email or password.");
    }

    const authUser = data.user || data.session?.user;

    try {
      const profile = await fetchProfile(authUser.id);
      return mapSupabaseUser(authUser, profile);
    } catch {
      return mapSupabaseUser(authUser);
    }
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

    const profile = await upsertProfile({
      id: session.user.id,
      email: nextEmail || data.user?.email || session.user.email || "",
      full_name: fullName,
      avatar_url: avatar,
      age: normalizeOptionalNumber(profilePayload.age),
      phone: profilePayload.phone?.trim() || null,
    });

    const nextAuthUser = data.user || {
      ...session.user,
      email: updatePayload.email || session.user.email,
      user_metadata: updatePayload.data,
    };
    setUser(mapSupabaseUser(nextAuthUser, profile));
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
