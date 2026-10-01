import { useTranslate } from "@tolgee/react";
import {
  getPasswordProblem,
  minPasswordLength,
} from "@typebot.io/auth/helpers/passwordRules";
import { useRouter } from "next/router";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { fieldbotAuthStyles as styles } from "./fieldbotAuthStyles";

type LinkStatus = "checking" | "valid" | "invalid";

/** "Nuova password" + "Conferma password", then back to the sign-in page. */
export const SetPasswordForm = () => {
  const { t } = useTranslate();
  const router = useRouter();
  const token = router.query.token?.toString();
  const [linkStatus, setLinkStatus] = useState<LinkStatus>("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string>();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!router.isReady) return;
    if (!token) return setLinkStatus("invalid");
    void fetch(`/api/auth/password/setup?token=${encodeURIComponent(token)}`)
      .then(async (response) => {
        if (!response.ok) return setLinkStatus("invalid");
        const body: { email?: string } = await response.json();
        setEmail(body.email ?? "");
        setLinkStatus("valid");
      })
      .catch(() => setLinkStatus("invalid"));
  }, [router.isReady, token]);

  const problemMessages = {
    tooShort: t("auth.setPassword.error.tooShort", {
      count: minPasswordLength,
    }),
    tooLong: t("auth.setPassword.error.tooLong"),
    tooSimple: t("auth.setPassword.error.tooSimple"),
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);
    const problem = getPasswordProblem(password);
    if (problem) return setError(problemMessages[problem]);
    if (password !== confirmation)
      return setError(t("auth.setPassword.error.mismatch"));
    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/password/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (response.ok) {
        await router.replace({
          pathname: "/signin",
          query: { email, passwordSet: "1" },
        });
        return;
      }
      const errorCode = await readErrorCode(response);
      if (errorCode === "invalid-link") setLinkStatus("invalid");
      else
        setError(
          errorCode === "tooShort" ||
            errorCode === "tooLong" ||
            errorCode === "tooSimple"
            ? problemMessages[errorCode]
            : t("auth.password.error.network"),
        );
    } catch {
      setError(t("auth.password.error.network"));
    }
    setIsLoading(false);
  };

  if (linkStatus === "checking")
    return <p className={styles.hint}>{t("auth.setPassword.checking")}</p>;

  if (linkStatus === "invalid")
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-[20px] text-[#333]">
          {t("auth.setPassword.invalidLink.title")}
        </h1>
        <p className="text-[15px] text-[#555]">
          {t("auth.setPassword.invalidLink.description")}
        </p>
        <div className="flex justify-end pt-2">
          <a
            href="/signin"
            className={`${styles.button} inline-flex items-center`}
          >
            {t("auth.setPassword.goToSignIn")}
          </a>
        </div>
      </div>
    );

  return (
    <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-1">
        <h1 className="text-[20px] text-[#333]">
          {t("auth.setPassword.title")}
        </h1>
        <p className="text-[15px] text-[#555]">
          {t("auth.setPassword.description")} <strong>{email}</strong>
        </p>
      </div>
      {/* Lets password managers save the new password with the right account. */}
      <input
        type="email"
        name="username"
        autoComplete="username"
        value={email}
        readOnly
        hidden
      />
      <div>
        <label className={styles.label} htmlFor="new-password">
          {t("auth.setPassword.newPassword")}
        </label>
        <input
          id="new-password"
          type="password"
          className={styles.input}
          autoComplete="new-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <p className={`${styles.hint} mt-1`}>
          {t("auth.setPassword.rules", { count: minPasswordLength })}
        </p>
      </div>
      <div>
        <label className={styles.label} htmlFor="confirm-password">
          {t("auth.setPassword.confirmPassword")}
        </label>
        <input
          id="confirm-password"
          type="password"
          className={styles.input}
          autoComplete="new-password"
          required
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
        />
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className="flex justify-end pt-4">
        <button type="submit" className={styles.button} disabled={isLoading}>
          {isLoading
            ? t("auth.setPassword.saving")
            : t("auth.setPassword.save")}
        </button>
      </div>
    </form>
  );
};

const readErrorCode = async (response: Response) => {
  const body: unknown = await response.json().catch(() => undefined);
  return typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "string"
    ? body.error
    : undefined;
};
