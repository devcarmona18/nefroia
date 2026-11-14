"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";

import { AuthForm } from "@/components/chat/auth-form";
import { SubmitButton } from "@/components/chat/submit-button";
import { toast } from "@/components/chat/toast";
import { type LoginActionState, login } from "../actions";

export default function Page() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [isSuccessful, setIsSuccessful] = useState(false);

  const [state, formAction] = useActionState<LoginActionState, FormData>(
    login,
    { status: "idle" }
  );

  const { update: updateSession } = useSession();

  // biome-ignore lint/correctness/useExhaustiveDependencies: router and updateSession are stable refs
  useEffect(() => {
    if (state.status === "failed") {
      toast({ description: t("toasts.invalidCredentials"), type: "error" });
    } else if (state.status === "invalid_data") {
      toast({
        description: t("toasts.invalidData"),
        type: "error",
      });
    } else if (state.status === "rate_limited") {
      toast({ description: t("toasts.rateLimited"), type: "error" });
    } else if (state.status === "success") {
      setIsSuccessful(true);
      updateSession();
      router.refresh();
    }
  }, [state.status]);

  const handleSubmit = (formData: FormData) => {
    setEmail(formData.get("email") as string);
    formAction(formData);
  };

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">
        {t("login.title")}
      </h1>
      <p className="text-sm text-muted-foreground">{t("login.subtitle")}</p>
      <AuthForm action={handleSubmit} defaultEmail={email}>
        <SubmitButton isSuccessful={isSuccessful}>
          {t("login.submit")}
        </SubmitButton>
        <p className="text-center text-[13px] text-muted-foreground">
          {`${t("login.noAccount")} `}
          <Link
            className="text-foreground underline-offset-4 hover:underline"
            href="/register"
          >
            {t("login.signUpLink")}
          </Link>
        </p>
      </AuthForm>
    </>
  );
}
