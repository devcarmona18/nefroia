"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { createUser, getUser } from "@/lib/db/queries";
import { AppError } from "@/lib/errors";
import { checkAuthRateLimit } from "@/lib/ratelimit";
import { getClientIp } from "@/lib/request";

import { signIn } from "./auth";

const authFormSchema = z.object({
  email: z.email().max(64),
  password: z.string().min(8).max(128),
});

async function getRateLimit(action: "login" | "register", email: unknown) {
  const requestHeaders = await headers();
  return checkAuthRateLimit({
    action,
    email: typeof email === "string" ? email : undefined,
    ip: getClientIp({ headers: requestHeaders }),
  });
}

export type LoginActionState = {
  status:
    | "idle"
    | "in_progress"
    | "success"
    | "failed"
    | "invalid_data"
    | "rate_limited";
};

export const login = async (
  _: LoginActionState,
  formData: FormData
): Promise<LoginActionState> => {
  try {
    if (!(await getRateLimit("login", formData.get("email"))).allowed) {
      return { status: "rate_limited" };
    }

    const validatedData = authFormSchema.parse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

    await signIn("credentials", {
      email: validatedData.email,
      password: validatedData.password,
      redirect: false,
    });

    return { status: "success" };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { status: "invalid_data" };
    }

    return { status: "failed" };
  }
};

export type RegisterActionState = {
  status:
    | "idle"
    | "in_progress"
    | "success"
    | "failed"
    | "user_exists"
    | "invalid_data"
    | "rate_limited";
};

export const register = async (
  _: RegisterActionState,
  formData: FormData
): Promise<RegisterActionState> => {
  try {
    if (!(await getRateLimit("register", formData.get("email"))).allowed) {
      return { status: "rate_limited" };
    }

    const validatedData = authFormSchema.parse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

    const [user] = await getUser(validatedData.email);

    if (user) {
      return { status: "user_exists" } as RegisterActionState;
    }
    await createUser(validatedData.email, validatedData.password);
    await signIn("credentials", {
      email: validatedData.email,
      password: validatedData.password,
      redirect: false,
    });

    return { status: "success" };
  } catch (error) {
    if (
      error instanceof AppError &&
      (error.cause as { code?: string } | undefined)?.code === "23505"
    ) {
      // Registro concurrente con el mismo email (índice único).
      return { status: "user_exists" };
    }

    if (error instanceof z.ZodError) {
      return { status: "invalid_data" };
    }

    return { status: "failed" };
  }
};
