import axios from "axios";
import { API_URL, clearSession, getStoredToken } from "./api";

let installed = false;
let redirecting = false;

/** Only requests to our API that are not the login call itself. */
const isAuthenticatedApiRequest = (url?: string) =>
  !!url && url.startsWith(API_URL) && !url.startsWith(`${API_URL}/auth/login`);

/**
 * Handles an expired or revoked session in one place. When the API answers 401
 * to a request that carried the user's current token, the stored session is
 * cleared and the user goes back to the login screen with a notice, instead of
 * every page failing with its own generic error.
 *
 * Registered once on the shared axios instance, so every existing call is
 * covered without changing call sites.
 */
export function installSessionExpiryHandler() {
  if (installed || typeof window === "undefined") {
    return;
  }
  installed = true;

  axios.interceptors.response.use(
    (response) => response,
    (error: unknown) => {
      if (
        axios.isAxiosError(error) &&
        error.response?.status === 401 &&
        isAuthenticatedApiRequest(error.config?.url)
      ) {
        const currentToken = getStoredToken();
        const sentWith = String(error.config?.headers?.Authorization ?? "");
        // Ignore stale requests sent with an older token (e.g. right after re-login).
        if (currentToken && sentWith === `Bearer ${currentToken}` && !redirecting) {
          redirecting = true;
          clearSession();
          window.location.assign("/?session=expired");
        }
      }

      return Promise.reject(error);
    },
  );
}

/**
 * Builds a user-facing message: the fallback plus whatever the API said
 * (Nest returns `message` as a string or an array of validation errors).
 */
export function extractErrorMessage(caughtError: unknown, fallback: string) {
  if (axios.isAxiosError(caughtError)) {
    const rawMessage = caughtError.response?.data?.message;
    const backendMessage =
      typeof rawMessage === "string"
        ? rawMessage
        : Array.isArray(rawMessage)
          ? rawMessage.join(". ")
          : "";

    if (backendMessage) {
      return `${fallback} ${backendMessage}`;
    }
  }

  return fallback;
}
