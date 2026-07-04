import { createHash, createHmac, randomBytes } from "crypto";

// Server-only. Never import this from client code.

function serverSecret(): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Server misconfigured");
  return secret;
}

// OTPs are only 6 digits (low entropy), so a bare hash would be
// brute-forceable from a raw table dump alone. HMAC with the service
// role secret (already required, already never exposed to the client)
// means guessing a code also requires that secret.
export function hashOtp(email: string, otp: string): string {
  return createHmac("sha256", serverSecret()).update(`${email}:${otp}`).digest("hex");
}

// Signup verification tokens are 256 bits of random data — a plain
// hash is sufficient since brute-forcing the token itself is infeasible.
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}
