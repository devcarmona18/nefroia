/**
 * Configuración de SSO para las pruebas e2e: el servidor de NefroIA arranca
 * con este secreto y acepta ser enmarcado solo por la "Hoja Diaria" local
 * que levanta tests/e2e/sso-embed.test.ts en 127.0.0.1 (otro sitio que
 * localhost, como en producción).
 */
export const E2E_HOJA_DIARIA_PORT = 3901;
export const E2E_SSO_SECRET =
  process.env.NEFROIA_SSO_SECRET ??
  "e2e-secreto-sso-hoja-diaria-0123456789abcdef";
export const E2E_HOJA_DIARIA_ORIGIN = `http://127.0.0.1:${E2E_HOJA_DIARIA_PORT}`;
