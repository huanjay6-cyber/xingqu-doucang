import { createClient } from "@supabase/supabase-js";

function readRequiredEnv(name: keyof ImportMetaEnv) {
  const value = import.meta.env[name];
  if (!value) {
    throw new Error(`缺少环境变量 ${name}，请在 .env.local 中配置 Supabase 项目信息`);
  }
  return value;
}

export const supabase = createClient(
  readRequiredEnv("VITE_SUPABASE_URL"),
  readRequiredEnv("VITE_SUPABASE_PUBLISHABLE_KEY"),
  {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
  },
);
