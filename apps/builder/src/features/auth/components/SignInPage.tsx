import { useTranslate } from "@tolgee/react";
import { Seo } from "@/components/Seo";
import { FieldbotAuthLayout } from "./FieldbotAuthLayout";
import { PasswordSignInForm } from "./PasswordSignInForm";

type Props = {
  type: "signin" | "signup";
  defaultEmail?: string;
};

/**
 * FIELDBOT sign-in: email (or username) + password. New users don't register
 * here: an admin invites them and they create their password from the link.
 */
export const SignInPage = (_props: Props) => {
  const { t } = useTranslate();
  return (
    <FieldbotAuthLayout>
      <Seo title={t("auth.signin.heading")} />
      <PasswordSignInForm />
    </FieldbotAuthLayout>
  );
};
