import { useTranslate } from "@tolgee/react";
import { Seo } from "@/components/Seo";
import { FieldbotAuthLayout } from "@/features/auth/components/FieldbotAuthLayout";
import { SetPasswordForm } from "@/features/auth/components/SetPasswordForm";

export default function Page() {
  const { t } = useTranslate();
  return (
    <FieldbotAuthLayout>
      <Seo title={t("auth.setPassword.title")} />
      <SetPasswordForm />
    </FieldbotAuthLayout>
  );
}
