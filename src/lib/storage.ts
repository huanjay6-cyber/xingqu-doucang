import type { AppData, AuthUser } from "../types";

const DB_NAME = "perler-bead-inventory";
const STORE_NAME = "app-state";
const LEGACY_STATE_KEY = "current";
const SESSION_KEY = "auth-session";

type StoredAccount = AuthUser & {
  passwordHash: string;
  passwordSalt: string;
  updatedAt: string;
};

type AuthSession = {
  userId: string;
  signedInAt: string;
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

export function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "");
}

export function validatePhone(phone: string) {
  return /^\d{11}$/.test(normalizePhone(phone));
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

function accountPhoneKey(phone: string) {
  return `account-phone:${phone}`;
}

function accountIdKey(userId: string) {
  return `account-id:${userId}`;
}

function toPublicUser(account: StoredAccount): AuthUser {
  return {
    id: account.id,
    phone: account.phone,
    createdAt: account.createdAt,
  };
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

async function hashPassword(password: string, salt: string) {
  const bytes = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

function createId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createSalt() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

async function setSession(userId: string) {
  await putValue<AuthSession>(SESSION_KEY, {
    userId,
    signedInAt: new Date().toISOString(),
  });
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const session = await getValue<AuthSession>(SESSION_KEY);
  if (!session?.userId) return null;
  const account = await getValue<StoredAccount>(accountIdKey(session.userId));
  if (!account) {
    await deleteValue(SESSION_KEY);
    return null;
  }
  return toPublicUser(account);
}

export async function registerAccount(phone: string, password: string): Promise<AuthUser> {
  const normalizedPhone = normalizePhone(phone);
  if (!validatePhone(normalizedPhone)) throw new Error("请输入 11 位手机号");
  if (!validatePassword(password)) throw new Error("密码需为 8-20 位，并包含字母和数字");
  const existing = await getValue<StoredAccount>(accountPhoneKey(normalizedPhone));
  if (existing) throw new Error("该手机号已注册");

  const now = new Date().toISOString();
  const passwordSalt = createSalt();
  const account: StoredAccount = {
    id: createId(),
    phone: normalizedPhone,
    passwordHash: await hashPassword(password, passwordSalt),
    passwordSalt,
    createdAt: now,
    updatedAt: now,
  };
  await putValue(accountPhoneKey(normalizedPhone), account);
  await putValue(accountIdKey(account.id), account);
  await putValue(userDataKey(account.id), createEmptyData());
  await setSession(account.id);
  return toPublicUser(account);
}

export async function loginAccount(phone: string, password: string): Promise<AuthUser> {
  const normalizedPhone = normalizePhone(phone);
  const account = await getValue<StoredAccount>(accountPhoneKey(normalizedPhone));
  if (!account) throw new Error("手机号或密码错误");
  const passwordHash = await hashPassword(password, account.passwordSalt);
  if (passwordHash !== account.passwordHash) throw new Error("手机号或密码错误");
  await setSession(account.id);
  return toPublicUser(account);
}

export async function logoutAccount() {
  await deleteValue(SESSION_KEY);
}

export async function resetPassword(phone: string, password: string) {
  const normalizedPhone = normalizePhone(phone);
  if (!validatePhone(normalizedPhone)) throw new Error("请输入 11 位手机号");
  if (!validatePassword(password)) throw new Error("密码需为 8-20 位，并包含字母和数字");
  const account = await getValue<StoredAccount>(accountPhoneKey(normalizedPhone));
  if (!account) throw new Error("该手机号尚未注册");
  const passwordSalt = createSalt();
  const nextAccount: StoredAccount = {
    ...account,
    passwordHash: await hashPassword(password, passwordSalt),
    passwordSalt,
    updatedAt: new Date().toISOString(),
  };
  await putValue(accountPhoneKey(normalizedPhone), nextAccount);
  await putValue(accountIdKey(nextAccount.id), nextAccount);
}

export async function changePassword(userId: string, oldPassword: string, nextPassword: string) {
  if (!validatePassword(nextPassword)) throw new Error("新密码需为 8-20 位，并包含字母和数字");
  const account = await getValue<StoredAccount>(accountIdKey(userId));
  if (!account) throw new Error("账号不存在，请重新登录");
  const oldPasswordHash = await hashPassword(oldPassword, account.passwordSalt);
  if (oldPasswordHash !== account.passwordHash) throw new Error("当前密码不正确");
  const passwordSalt = createSalt();
  const nextAccount: StoredAccount = {
    ...account,
    passwordHash: await hashPassword(nextPassword, passwordSalt),
    passwordSalt,
    updatedAt: new Date().toISOString(),
  };
  await putValue(accountPhoneKey(account.phone), nextAccount);
  await putValue(accountIdKey(account.id), nextAccount);
}

export async function deleteAccount(userId: string) {
  const account = await getValue<StoredAccount>(accountIdKey(userId));
  if (!account) return;
  await deleteValue(accountPhoneKey(account.phone));
  await deleteValue(accountIdKey(account.id));
  await deleteValue(userDataKey(account.id));
  const session = await getValue<AuthSession>(SESSION_KEY);
  if (session?.userId === userId) await deleteValue(SESSION_KEY);
}

export async function loadData(userId: string): Promise<AppData> {
  const stored = await getValue<Partial<AppData>>(userDataKey(userId));
  return mergeStoredData(stored);
}

export async function saveData(userId: string, data: AppData) {
  await putValue(userDataKey(userId), data);
}

export async function clearStoredData(userId: string) {
  await putValue(userDataKey(userId), createEmptyData());
}

export async function loadLegacyData(): Promise<AppData> {
  const stored = await getValue<Partial<AppData>>(LEGACY_STATE_KEY);
  return mergeStoredData(stored);
}
