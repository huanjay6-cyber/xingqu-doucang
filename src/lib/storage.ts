import type { AppData, AuthUser } from "../types";
import type { User } from "@supabase/supabase-js";
import { dataUrlToBlob } from "./image";
import { supabase } from "./supabase";

const DB_NAME = "perler-bead-inventory";
const STORE_NAME = "app-state";
const LEGACY_STATE_KEY = "current";
const APP_DATA_TABLE = "user_app_data";
const PATTERN_IMAGE_BUCKET = "pattern-images";

type AppDataRow = {
  data: Partial<AppData> | null;
};

export const createEmptyData = (): AppData => ({
  version: 1,
  inventory: {},
  stockChanges: [],
  consumptions: [],
  patterns: [],
  settings: {
    lowStockThreshold: 50,
  },
});

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

export function validatePassword(password: string) {
  return /^(?=.*[A-Za-z])(?=.*\d).{8,20}$/.test(password);
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function userDataKey(userId: string) {
  return `user-data:${userId}`;
}

function toPublicUser(user: User): AuthUser {
  if (!user.email) throw new Error("账号缺少邮箱信息，请重新登录");
  return {
    id: user.id,
    email: user.email,
    createdAt: user.created_at,
  };
}

function authErrorMessage(message: string, fallback = "操作失败，请稍后再试") {
  if (message.includes("Invalid login credentials")) return "邮箱或密码错误";
  if (message.includes("Email not confirmed")) return "请先前往邮箱完成验证，再登录";
  if (message.includes("User already registered")) return "该邮箱已注册";
  if (message.includes("Password should be")) return "密码不符合平台要求，请换一个更安全的密码";
  return message || fallback;
}

function dataErrorMessage(message: string) {
  if (message.includes("JWT")) return "登录状态已过期，请重新登录";
  if (message.includes("permission denied") || message.includes("row-level security")) return "没有权限访问该账号数据";
  return message || "数据同步失败，请稍后再试";
}

function isDataUrl(value: string | undefined): value is string {
  return Boolean(value?.startsWith("data:image/"));
}

function imageExtension(blob: Blob) {
  if (blob.type === "image/png") return "png";
  if (blob.type === "image/webp") return "webp";
  return "jpg";
}

function imageStoragePath(userId: string, patternId: string, blob: Blob) {
  return `${userId}/${patternId}.${imageExtension(blob)}`;
}

function getPublicImageUrl(path: string) {
  const { data } = supabase.storage.from(PATTERN_IMAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

function imagePathFromPublicUrl(imageUrl: string | undefined) {
  if (!imageUrl || isDataUrl(imageUrl)) return null;
  const marker = `/storage/v1/object/public/${PATTERN_IMAGE_BUCKET}/`;
  try {
    const pathname = new URL(imageUrl).pathname;
    const index = pathname.indexOf(marker);
    if (index === -1) return null;
    return decodeURIComponent(pathname.slice(index + marker.length));
  } catch {
    return null;
  }
}

export async function uploadPatternImage(userId: string, patternId: string, blob: Blob): Promise<string> {
  const path = imageStoragePath(userId, patternId, blob);
  const { error } = await supabase.storage
    .from(PATTERN_IMAGE_BUCKET)
    .upload(path, blob, {
      cacheControl: "31536000",
      contentType: blob.type || "image/jpeg",
      upsert: true,
    });
  if (error) throw new Error(dataErrorMessage(error.message));
  return getPublicImageUrl(path);
}

export async function deletePatternImage(imageUrl: string | undefined) {
  const path = imagePathFromPublicUrl(imageUrl);
  if (!path) return;
  const { error } = await supabase.storage.from(PATTERN_IMAGE_BUCKET).remove([path]);
  if (error) throw new Error(dataErrorMessage(error.message));
}

async function deletePatternImagesForUser(userId: string) {
  const { data, error } = await supabase.storage.from(PATTERN_IMAGE_BUCKET).list(userId);
  if (error) throw new Error(dataErrorMessage(error.message));
  const paths = (data ?? [])
    .filter((item) => !item.name.endsWith("/"))
    .map((item) => `${userId}/${item.name}`);
  if (!paths.length) return;
  const { error: removeError } = await supabase.storage.from(PATTERN_IMAGE_BUCKET).remove(paths);
  if (removeError) throw new Error(dataErrorMessage(removeError.message));
}

async function migratePatternImages(userId: string, data: AppData): Promise<AppData> {
  let changed = false;
  const patterns = await Promise.all(data.patterns.map(async (pattern) => {
    if (!isDataUrl(pattern.imageDataUrl)) return pattern;
    const imageUrl = await uploadPatternImage(userId, pattern.id, dataUrlToBlob(pattern.imageDataUrl));
    changed = true;
    return { ...pattern, imageDataUrl: imageUrl };
  }));
  return changed ? { ...data, patterns } : data;
}

function mergeStoredData(stored: Partial<AppData> | undefined): AppData {
  const empty = createEmptyData();
  return stored ? {
    ...empty,
    ...stored,
    stockChanges: stored.stockChanges ?? [],
    settings: { ...empty.settings, ...stored.settings },
  } : empty;
}

async function getValue<T>(key: string): Promise<T | undefined> {
  const database = await openDatabase();
  return new Promise<T | undefined>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => {
      resolve(request.result as T | undefined);
    };
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

async function putValue<T>(key: string, value: T) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(value, key);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

async function deleteValue(key: string) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(key);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return toPublicUser(data.user);
}

export async function registerAccount(email: string, password: string): Promise<AuthUser> {
  const normalizedEmail = normalizeEmail(email);
  if (!validateEmail(normalizedEmail)) throw new Error("请输入正确的邮箱地址");
  if (!validatePassword(password)) throw new Error("密码需为 8-20 位，并包含字母和数字");
  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
  });
  if (error) throw new Error(authErrorMessage(error.message));
  if (!data.user) throw new Error("注册失败，请稍后再试");
  if (!data.session) throw new Error("注册成功，请先前往邮箱完成验证后再登录");

  await saveData(data.user.id, createEmptyData());
  return toPublicUser(data.user);
}

export async function loginAccount(email: string, password: string): Promise<AuthUser> {
  const normalizedEmail = normalizeEmail(email);
  if (!validateEmail(normalizedEmail)) throw new Error("请输入正确的邮箱地址");
  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });
  if (error) throw new Error(authErrorMessage(error.message));
  if (!data.user) throw new Error("登录失败，请稍后再试");
  return toPublicUser(data.user);
}

export async function logoutAccount() {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(authErrorMessage(error.message));
}

export async function resetPassword(email: string) {
  const normalizedEmail = normalizeEmail(email);
  if (!validateEmail(normalizedEmail)) throw new Error("请输入正确的邮箱地址");
  const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
    redirectTo: window.location.origin,
  });
  if (error) throw new Error(authErrorMessage(error.message));
}

export async function changePassword(userId: string, oldPassword: string, nextPassword: string) {
  if (!validatePassword(nextPassword)) throw new Error("新密码需为 8-20 位，并包含字母和数字");
  const { data: current, error: currentError } = await supabase.auth.getUser();
  if (currentError || !current.user || current.user.id !== userId) throw new Error("账号不存在，请重新登录");
  if (!current.user.email) throw new Error("账号缺少邮箱信息，请重新登录");

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: current.user.email,
    password: oldPassword,
  });
  if (verifyError) throw new Error("当前密码不正确");

  const { error } = await supabase.auth.updateUser({ password: nextPassword });
  if (error) throw new Error(authErrorMessage(error.message, "修改失败，请稍后再试"));
}

export async function deleteAccount(userId: string) {
  await deleteValue(userDataKey(userId));
  await deletePatternImagesForUser(userId);
  const { error } = await supabase
    .from(APP_DATA_TABLE)
    .delete()
    .eq("user_id", userId);
  if (error) throw new Error(dataErrorMessage(error.message));
  await logoutAccount();
}

export async function loadData(userId: string): Promise<AppData> {
  const { data, error } = await supabase
    .from(APP_DATA_TABLE)
    .select("data")
    .eq("user_id", userId)
    .maybeSingle<AppDataRow>();
  if (error) throw new Error(dataErrorMessage(error.message));
  if (data?.data) {
    const storedData = mergeStoredData(data.data);
    const migratedData = await migratePatternImages(userId, storedData);
    if (migratedData !== storedData) await saveData(userId, migratedData);
    return migratedData;
  }

  const localData = await getValue<Partial<AppData>>(userDataKey(userId));
  const initialData = mergeStoredData(localData);
  const migratedData = await migratePatternImages(userId, initialData);
  await saveData(userId, migratedData);
  return migratedData;
}

export async function saveData(userId: string, data: AppData) {
  const { error } = await supabase
    .from(APP_DATA_TABLE)
    .upsert({
      user_id: userId,
      data,
    });
  if (error) throw new Error(dataErrorMessage(error.message));
}

export async function clearStoredData(userId: string) {
  await deleteValue(userDataKey(userId));
  await deletePatternImagesForUser(userId);
  await saveData(userId, createEmptyData());
}

export async function loadLegacyData(): Promise<AppData> {
  const stored = await getValue<Partial<AppData>>(LEGACY_STATE_KEY);
  return mergeStoredData(stored);
}
