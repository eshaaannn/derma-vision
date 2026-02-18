import { createContext, useContext, useMemo, useState } from "react";
import { createId } from "../utils/id";

const AUTH_STORAGE_KEY = "derma_auth_state";
const USERS_STORAGE_KEY = "derma_users";

const AuthContext = createContext(null);

function getSavedAuthState() {
  const raw = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) {
    return { user: null, token: null };
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    return { user: null, token: null };
  }
}

function getUsers() {
  const raw = localStorage.getItem(USERS_STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch (error) {
    return [];
  }
}

function saveUsers(users) {
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
}

function saveAuthState(state) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(state));
}

function fakeDelay(timeout = 800) {
  return new Promise((resolve) => {
    setTimeout(resolve, timeout);
  });
}

export function AuthProvider({ children }) {
  const initialState = getSavedAuthState();
  const [user, setUser] = useState(initialState.user);
  const [token, setToken] = useState(initialState.token);

  const signup = async ({ fullName, email, password }) => {
    await fakeDelay();
    const users = getUsers();
    const exists = users.find((entry) => entry.email === email.toLowerCase());
    if (exists) {
      throw new Error("An account with this email already exists.");
    }

    const newUser = {
      id: createId("user"),
      fullName,
      email: email.toLowerCase(),
      password,
      avatar:
        "https://api.dicebear.com/9.x/thumbs/svg?seed=" +
        encodeURIComponent(fullName),
      age: "",
      phone: "",
    };

    users.push(newUser);
    saveUsers(users);

    const nextToken = `token_${Date.now()}`;
    const authUser = { ...newUser };
    delete authUser.password;

    setUser(authUser);
    setToken(nextToken);
    saveAuthState({ user: authUser, token: nextToken });
    return authUser;
  };

  const login = async ({ email, password }) => {
    await fakeDelay();
    const users = getUsers();
    const account = users.find(
      (entry) => entry.email === email.toLowerCase() && entry.password === password
    );

    if (!account) {
      throw new Error("Invalid email or password.");
    }

    const nextToken = `token_${Date.now()}`;
    const authUser = { ...account };
    delete authUser.password;

    setUser(authUser);
    setToken(nextToken);
    saveAuthState({ user: authUser, token: nextToken });
    return authUser;
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    saveAuthState({ user: null, token: null });
  };

  const updateProfile = async (profilePayload) => {
    await fakeDelay(500);
    if (!user) return;

    const users = getUsers();
    const nextUsers = users.map((entry) =>
      entry.id === user.id ? { ...entry, ...profilePayload } : entry
    );
    saveUsers(nextUsers);

    const nextUser = { ...user, ...profilePayload };
    setUser(nextUser);
    saveAuthState({ user: nextUser, token });
  };

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(token && user),
      login,
      signup,
      logout,
      updateProfile,
    }),
    [token, user]
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
