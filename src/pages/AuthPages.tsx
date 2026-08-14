import { useState } from "react";
import { KeyRound, LogIn, LogOut, Mail, ShieldAlert, Trash2, UserPlus } from "lucide-react";
import { ConfirmDialog, PageBody, TopBar } from "../components";
import { useAppStore } from "../store";
import { validateEmail, validatePassword } from "../lib/storage";

type AuthMode = "login" | "register" | "recover";

function passwordFieldError(password: string, confirmPassword?: string) {
  if (!validatePassword(password)) return "密码需为 8-20 位，并包含字母和数字";
  if (confirmPassword !== undefined && password !== confirmPassword) return "两次输入的密码不一致";
  return "";
}

function authFieldError(email: string, password: string, confirmPassword?: string) {
  if (!validateEmail(email)) return "请输入正确的邮箱地址";
  return passwordFieldError(password, confirmPassword);
}

function emailFieldError(email: string) {
  if (!validateEmail(email)) return "请输入正确的邮箱地址";
  return "";
}

export function AuthPage() {
  const { login, register, recoverPassword } = useAppStore();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const resetForm = (nextMode: AuthMode) => {
    setMode(nextMode);
    setPassword("");
    setConfirmPassword("");
    setError("");
    setMessage("");
  };

  const submit = async () => {
    const validation = mode === "recover"
      ? emailFieldError(email)
      : mode === "login"
        ? authFieldError(email, password)
        : authFieldError(email, password, confirmPassword);
    if (validation) {
      setError(validation);
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (mode === "login") {
        await login(email, password);
        return;
      }
      if (mode === "register") {
        await register(email, password);
        return;
      }
      await recoverPassword(email);
      setMode("login");
      setPassword("");
      setConfirmPassword("");
      setMessage("重置邮件已发送，请前往邮箱继续操作");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "操作失败，请稍后再试");
    } finally {
      setBusy(false);
    }
  };

  const title = mode === "login" ? "登录豆仓" : mode === "register" ? "注册账号" : "找回密码";
  const actionLabel = mode === "login" ? "登录" : mode === "register" ? "注册并登录" : "发送重置邮件";
  const ActionIcon = mode === "register" ? UserPlus : mode === "recover" ? KeyRound : LogIn;

  return (
    <div className="auth-screen">
      <section className="auth-panel">
        <div className="auth-brand">
          <span className="auth-brand__mark" />
          <div>
            <strong>兴趣豆仓</strong>
            <small>{title}</small>
          </div>
        </div>

        <div className="auth-form">
          <label className="auth-field">
            <span>邮箱</span>
            <div>
              <Mail size={18} />
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="请输入邮箱地址"
              />
            </div>
          </label>

          {mode !== "recover" ? (
            <label className="auth-field">
              <span>密码</span>
              <div>
                <KeyRound size={18} />
                <input
                  type="password"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="8-20 位，包含字母和数字"
                />
              </div>
            </label>
          ) : null}

          {mode === "register" ? (
            <label className="auth-field">
              <span>确认密码</span>
              <div>
                <KeyRound size={18} />
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="请再次输入密码"
                />
              </div>
            </label>
          ) : null}

          {mode === "register" ? (
            <p className="auth-note">注册后可使用邮箱和密码登录账号。</p>
          ) : null}
          {mode === "recover" ? (
            <p className="auth-note">系统会向该邮箱发送 Supabase 密码重置邮件。</p>
          ) : null}
          {message ? <p className="auth-message">{message}</p> : null}
          {error ? <p className="auth-error">{error}</p> : null}

          <button className="button button--primary button--full auth-submit" disabled={busy} onClick={() => void submit()}>
            <ActionIcon size={19} />{busy ? "处理中" : actionLabel}
          </button>
        </div>

        <div className="auth-links">
          {mode !== "login" ? <button onClick={() => resetForm("login")}>返回登录</button> : null}
          {mode !== "register" ? <button onClick={() => resetForm("register")}>注册账号</button> : null}
          {mode !== "recover" ? <button onClick={() => resetForm("recover")}>忘记密码</button> : null}
        </div>
      </section>
    </div>
  );
}

export function AccountSettingsPage({ back }: { back: () => void }) {
  const { user, logout, changeCurrentPassword, deleteCurrentAccount } = useAppStore();
  const [oldPassword, setOldPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const savePassword = async () => {
    const validation = passwordFieldError(nextPassword, confirmPassword);
    if (validation) {
      setError(validation);
      return;
    }
    if (!oldPassword) {
      setError("请输入当前密码");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await changeCurrentPassword(oldPassword, nextPassword);
      setOldPassword("");
      setNextPassword("");
      setConfirmPassword("");
      setMessage("密码已更新");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "修改失败，请稍后再试");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <TopBar title="账号设置" onBack={back} />
      <PageBody className="form-page">
        <section className="account-card">
          <span className="account-card__avatar">{user?.email.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{user?.email}</strong>
            <small>当前登录账号</small>
          </div>
        </section>

        <section className="form-section field-stack">
          <h2>修改密码</h2>
          <label className="field-label" htmlFor="old-password">当前密码</label>
          <input id="old-password" className="text-input" type="password" value={oldPassword} onChange={(event) => setOldPassword(event.target.value)} />
          <label className="field-label" htmlFor="new-password">新密码</label>
          <input id="new-password" className="text-input" type="password" value={nextPassword} onChange={(event) => setNextPassword(event.target.value)} placeholder="8-20 位，包含字母和数字" />
          <label className="field-label" htmlFor="confirm-new-password">确认新密码</label>
          <input id="confirm-new-password" className="text-input" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
          {message ? <p className="auth-message">{message}</p> : null}
          {error ? <p className="auth-error">{error}</p> : null}
          <button className="button button--primary button--full" disabled={busy} onClick={() => void savePassword()}>
            <KeyRound size={18} />{busy ? "保存中" : "保存新密码"}
          </button>
        </section>

        <section className="form-section field-stack">
          <h2>账号操作</h2>
          <button className="button button--secondary button--full" onClick={() => void logout()}>
            <LogOut size={18} />退出登录
          </button>
          <button className="button button--plain-danger button--full" onClick={() => setShowDelete(true)}>
            <Trash2 size={18} />清空账号数据
          </button>
        </section>
      </PageBody>

      {showDelete ? (
        <ConfirmDialog
          title="清空账号数据？"
          description={(
            <div className="dialog-warning">
              <ShieldAlert size={20} />
              <span>该账号下的库存、图纸、消耗记录、设置会被清空，并退出登录。Supabase 账号本身不会被删除。</span>
            </div>
          )}
          confirmLabel="确认清空"
          danger
          onCancel={() => setShowDelete(false)}
          onConfirm={() => { void deleteCurrentAccount(); setShowDelete(false); }}
        />
      ) : null}
    </>
  );
}
