import { useTranslate } from "@tolgee/react";
import { sanitizeRedirectPath } from "@typebot.io/auth/helpers/sanitizeRedirectPath";
import { useRouter } from "next/router";
import { getProviders, signIn, useSession } from "next-auth/react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { fieldbotAuthStyles as styles } from "./fieldbotAuthStyles";

/** "Username o email" + "Password" + "Entra", like the team's other survey tools. */
export const PasswordSignInForm = () => {
  const { t } = useTranslate();
  const router = useRouter();
  const { status } = useSession();
  const redirectPath = sanitizeRedirectPath(
    router.query.redirectPath?.toString(),
  );
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [isLoading, setIsLoading] = useState(false);
  const [hasGitHub, setHasGitHub] = useState(false);
  const isPasswordJustSet = router.query.passwordSet === "1";
  // Errors of the other sign-in methods (e.g. GitHub account not invited).
  const providerError = router.query.error?.toString();

  useEffect(() => {
    if (!router.isReady) return;
    const email = router.query.email?.toString();
    if (email) setIdentifier((current) => current || email);
  }, [router.isReady, router.query.email]);

  useEffect(() => {
    if (status === "authenticated")
      void router.replace(redirectPath ?? "/typebots");
  }, [status, router, redirectPath]);

  useEffect(() => {
    void getProviders().then((providers) =>
      setHasGitHub(Boolean(providers?.github)),
    );
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);
    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/password/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      if (response.ok) {
        window.location.assign(redirectPath ?? "/typebots");
        return;
      }
      const body: unknown = await response.json().catch(() => undefined);
      const errorCode =
        typeof body === "object" && body !== null && "error" in body
          ? body.error
          : undefined;
      setError(
        errorCode === "too-many-attempts"
          ? t("auth.password.error.tooManyAttempts")
          : t("auth.password.error.invalidCredentials"),
      );
    } catch {
      setError(t("auth.password.error.network"));
    }
    setIsLoading(false);
  };

  return (
    <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
      {isPasswordJustSet && (
        <p className={styles.success} role="status">
          {t("auth.password.passwordSet")}
        </p>
      )}
      <div>
        <label className={styles.label} htmlFor="identifier">
          {t("auth.password.identifier")}
        </label>
        <input
          id="identifier"
          name="username"
          className={styles.input}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
        />
      </div>
      <div>
        <label className={styles.label} htmlFor="password">
          {t("auth.password.password")}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          className={styles.input}
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          // biome-ignore lint/a11y/noAutofocus: the sign-in page has a single purpose.
          autoFocus={Boolean(router.query.email)}
        />
      </div>
      {(error ?? providerError) && (
        <p className={styles.error} role="alert">
          {error ?? t("auth.password.error.provider")}
        </p>
      )}
      <div className="flex justify-end pt-6">
        <button type="submit" className={styles.button} disabled={isLoading}>
          {isLoading ? t("auth.password.signingIn") : t("auth.password.signIn")}
        </button>
      </div>
      <div className="flex flex-col gap-1 border-t border-[#eee] pt-4">
        <p className={styles.hint}>{t("auth.password.forgotten")}</p>
        {hasGitHub && (
          <button
            type="button"
            className={`${styles.hint} ${styles.link} text-left`}
            onClick={() =>
              signIn("github", {
                redirectTo: redirectPath ?? "/typebots",
              })
            }
          >
            {t("auth.password.githubSignIn")}
          </button>
        )}
      </div>
    </form>
  );
};
