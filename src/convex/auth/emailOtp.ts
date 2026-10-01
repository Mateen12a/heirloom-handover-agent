import { Email } from "@convex-dev/auth/providers/Email";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";

// One-time sign-in codes are delivered through Resend. Set RESEND_API_KEY
// (and optionally AUTH_EMAIL_FROM) on the Convex deployment. Guest sign-in
// works without either.
export const emailOtp = Email({
  id: "email-otp",
  maxAge: 60 * 15, // 15 minutes
  async generateVerificationToken() {
    const random: RandomReader = {
      read(bytes: Uint8Array) {
        crypto.getRandomValues(bytes);
      },
    };
    const alphabet = "0123456789";
    return generateRandomString(random, alphabet, 6);
  },
  async sendVerificationRequest({ identifier: email, token }) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Email sign-in is not configured on this deployment. Continue as guest instead.",
      );
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from:
          process.env.AUTH_EMAIL_FROM ||
          "Heirloom Handover Agent <onboarding@resend.dev>",
        to: [email],
        subject: `Your Heirloom sign-in code: ${token}`,
        text: `Your Heirloom Handover Agent sign-in code is ${token}. It expires in 15 minutes.`,
      }),
    });
    if (!res.ok) {
      throw new Error(`Could not send the sign-in code (${res.status}).`);
    }
  },
});
