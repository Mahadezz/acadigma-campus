/**
 * F-ID-01 §5 "Account deletion grace: 30 days". The database enforces it
 * (`account_deletion_requests_grace` CHECK, D-113); this constant is the
 * copy's number, so the screen can never promise a different grace.
 */
export const ACCOUNT_DELETION_GRACE_DAYS = 30
