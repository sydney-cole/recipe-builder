export const VERIFICATION_CODE_TTL_SECONDS = 15 * 60;

export function generateVerificationCode() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(values[0] % 1_000_000).padStart(6, "0");
}

export function verificationEmail(code: string) {
  return {
    subject: "Verify your PerfectPlate email",
    text: `Your PerfectPlate verification code is ${code}. It expires in 15 minutes. If you did not request this code, you can ignore this email.`,
    html: `<p>Your PerfectPlate verification code is:</p><p style="font-size:24px;font-weight:700;letter-spacing:0.2em">${code}</p><p>It expires in 15 minutes. If you did not request this code, you can ignore this email.</p>`,
  };
}
