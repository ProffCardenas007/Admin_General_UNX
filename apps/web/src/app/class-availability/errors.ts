import axios from "axios";

/** First message the API sent (Nest may send a string or a list), else the fallback. */
export function getApiErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    const responseMessage = error.response?.data?.message;

    if (typeof responseMessage === "string" && responseMessage.trim().length > 0) {
      return responseMessage;
    }

    if (Array.isArray(responseMessage) && responseMessage.length > 0) {
      const firstMessage = responseMessage[0];
      if (typeof firstMessage === "string" && firstMessage.trim().length > 0) {
        return firstMessage;
      }
    }
  }

  return fallback;
}

export function getApiErrorStatus(error: unknown) {
  return axios.isAxiosError(error) ? error.response?.status : undefined;
}

/**
 * Message for a failed action. A 403 gets the specific "needs manager" text when
 * one is given. An expired session (401) is handled for every request by the
 * shared interceptor in lib/http.ts, so it is not special-cased here.
 */
export function planningErrorMessage(error: unknown, fallback: string, forbiddenMessage?: string) {
  if (forbiddenMessage && getApiErrorStatus(error) === 403) {
    return forbiddenMessage;
  }
  return getApiErrorMessage(error, fallback);
}
