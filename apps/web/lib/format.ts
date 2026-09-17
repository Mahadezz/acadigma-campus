/** "m…@gmail.com" — F-ID-01 §4.1: "We sent a link to _m…@gmail.com_". Pure
 * display formatting, not a business rule, so it lives beside the other
 * presentation helpers rather than in packages/domain. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@")
  if (!local || !domain) return email
  const visible = local.slice(0, 1)
  return `${visible}…@${domain}`
}
