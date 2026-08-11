import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { PropsWithChildren } from "react";
import type { AppData, AuthUser } from "./types";
import {
  changePassword,
  clearStoredData,
  createEmptyData,
  deleteAccount,
  getCurrentUser,
  loadData,
  loginAccount,
  logoutAccount,
  registerAccount,
  resetPassword,
  saveData,
} from "./lib/storage";

type AppStoreValue = {
  data: AppData;
  ready: boolean;
  user: AuthUser | null;
  updateData: (updater: (current: AppData) => AppData) => void;
  resetData: () => Promise<void>;
  login: (phone: string, password: string) => Promise<void>;
  register: (phone: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  recoverPassword: (phone: string, password: string) => Promise<void>;
  changeCurrentPassword: (oldPassword: string, nextPassword: string) => Promise<void>;
  deleteCurrentAccount: () => Promise<void>;
};

const AppStoreContext = createContext<AppStoreValue | null>(null);

export function AppStoreProvider({ children }: PropsWithChildren) {
  const [data, setData] = useState<AppData>(createEmptyData);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    getCurrentUser()
      .then(async (currentUser) => {
        if (!active) return;
        setUser(currentUser);
        if (!currentUser) {
          setData(createEmptyData());
          return;
        }
        setData(await loadData(currentUser.id));
      })
      .catch(() => {
        if (active) {
          setUser(null);
          setData(createEmptyData());
        }
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!ready || !user) return;
    const timeout = window.setTimeout(() => {
      void saveData(user.id, data).catch(() => undefined);
    }, 120);
    return () => window.clearTimeout(timeout);
  }, [data, ready, user]);

  const updateData = useCallback((updater: (current: AppData) => AppData) => {
    setData((current) => updater(current));
  }, []);

  const resetData = useCallback(async () => {
    if (!user) return;
    await clearStoredData(user.id);
    setData(createEmptyData());
  }, [user]);

  const loadUserData = useCallback(async (nextUser: AuthUser) => {
    setUser(nextUser);
    setData(await loadData(nextUser.id));
  }, []);

  const login = useCallback(async (phone: string, password: string) => {
    await loadUserData(await loginAccount(phone, password));
  }, [loadUserData]);

  const register = useCallback(async (phone: string, password: string) => {
    await loadUserData(await registerAccount(phone, password));
  }, [loadUserData]);

  const logout = useCallback(async () => {
    await logoutAccount();
    setUser(null);
    setData(createEmptyData());
  }, []);

  const recoverPassword = useCallback(async (phone: string, password: string) => {
    await resetPassword(phone, password);
  }, []);

  const changeCurrentPassword = useCallback(async (oldPassword: string, nextPassword: string) => {
    if (!user) throw new Error("请先登录");
    await changePassword(user.id, oldPassword, nextPassword);
  }, [user]);

  const deleteCurrentAccount = useCallback(async () => {
    if (!user) return;
    await deleteAccount(user.id);
    setUser(null);
    setData(createEmptyData());
  }, [user]);

  const value = useMemo(
    () => ({
      data,
      ready,
      user,
      updateData,
      resetData,
      login,
      register,
      logout,
      recoverPassword,
      changeCurrentPassword,
      deleteCurrentAccount,
    }),
    [
      data,
      ready,
      user,
      updateData,
      resetData,
      login,
      register,
      logout,
      recoverPassword,
      changeCurrentPassword,
      deleteCurrentAccount,
    ],
  );

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore() {
  const store = useContext(AppStoreContext);
  if (!store) throw new Error("useAppStore 必须在 AppStoreProvider 中使用");
  return store;
}
