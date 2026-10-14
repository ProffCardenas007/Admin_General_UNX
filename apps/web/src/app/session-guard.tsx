"use client";

import { installSessionExpiryHandler } from "../lib/http";

// Registered when the client bundle loads, so it is in place before any page
// effect fires its first request.
installSessionExpiryHandler();

export default function SessionGuard() {
  return null;
}
