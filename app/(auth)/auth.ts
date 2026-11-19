import { compare } from "bcrypt-ts";
import NextAuth, { type DefaultSession } from "next-auth";
import type { DefaultJWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import { DUMMY_PASSWORD } from "@/lib/constants";
import { createGuestUser, getUser } from "@/lib/db/queries";
import {
  crossSiteCookieOptions,
  SSO_SESSION_SECONDS,
  SSO_USER_PREFIX,
} from "@/lib/sso/config";
import { authenticateSsoToken } from "@/lib/sso/server";
import { authConfig } from "./auth.config";

/**
 * - guest / regular: cuentas propias de NefroIA.
 * - hdr: usuario administrador de Hoja Diaria Renal (SSO).
 * - hdr-demo: visitante en modo demo de Hoja Diaria (límites de invitado,
 *   sin subir protocolos ni archivos).
 */
export type UserType = "guest" | "regular" | "hdr" | "hdr-demo";

export function isSsoUserType(type: UserType | undefined) {
  return type === "hdr" || type === "hdr-demo";
}

// Con el modo integrado (iframe en Hoja Diaria) las cookies de Auth.js deben
// viajar en contexto de terceros: SameSite=None; Secure. El nombre no cambia.
const sameSiteOptions = crossSiteCookieOptions();
const embeddedCookies =
  sameSiteOptions.sameSite === "none"
    ? {
        callbackUrl: { options: sameSiteOptions },
        csrfToken: { options: sameSiteOptions },
        sessionToken: { options: sameSiteOptions },
      }
    : undefined;

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      type: UserType;
    } & DefaultSession["user"];
  }

  interface User {
    email?: string | null;
    id?: string;
    type: UserType;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string;
    /** Fin (segundos epoch) de una sesión iniciada por SSO. */
    ssoExp?: number;
    type: UserType;
  }
}

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  ...authConfig,
  ...(embeddedCookies ? { cookies: embeddedCookies } : {}),
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.type = user.type;
        token.ssoExp = isSsoUserType(user.type)
          ? Math.floor(Date.now() / 1000) + SSO_SESSION_SECONDS
          : undefined;
      }

      // Las sesiones de SSO duran lo mismo que la de Hoja Diaria (8 h).
      if (
        isSsoUserType(token.type) &&
        (!token.ssoExp || token.ssoExp < Date.now() / 1000)
      ) {
        return null;
      }

      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.type = token.type;
      }

      return session;
    },
  },
  providers: [
    Credentials({
      async authorize(credentials) {
        const email = String(credentials.email ?? "");
        const password = String(credentials.password ?? "");
        // Las cuentas vinculadas a Hoja Diaria solo entran por SSO.
        if (email.trim().toLowerCase().startsWith(SSO_USER_PREFIX)) {
          await compare(password, DUMMY_PASSWORD);
          return null;
        }
        const users = await getUser(email);

        if (users.length === 0) {
          await compare(password, DUMMY_PASSWORD);
          return null;
        }

        const [user] = users;

        if (!user.password) {
          await compare(password, DUMMY_PASSWORD);
          return null;
        }

        const passwordsMatch = await compare(password, user.password);

        if (!passwordsMatch) {
          return null;
        }

        return { ...user, type: "regular" };
      },
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
    }),
    Credentials({
      async authorize() {
        const [guestUser] = await createGuestUser();
        return { ...guestUser, type: "guest" };
      },
      credentials: {},
      id: "guest",
    }),
    // SSO desde Hoja Diaria Renal: token HS256 de un solo uso (ver /sso).
    Credentials({
      async authorize(credentials) {
        const result = await authenticateSsoToken(credentials.token);
        if (!result.ok) {
          return null;
        }
        return {
          email: result.user.email,
          id: result.user.id,
          name: result.user.name,
          type: result.claims.role === "demo" ? "hdr-demo" : "hdr",
        };
      },
      credentials: { token: {} },
      id: "hoja-diaria",
    }),
  ],
});
