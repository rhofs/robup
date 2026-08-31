import crypto from 'crypto';

// Shared by the forgot-password and reset-password routes. Kept here rather than exported from
// one route and imported by the other: Next validates that a route file exports only known HTTP
// handlers, so a stray helper export there fails the build's own route type-check.

export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

// SHA-256, not bcrypt. The stored value must be *looked up* by an incoming token, which needs a
// deterministic hash — bcrypt's per-row salt makes that impossible without scanning every row.
// Safe here in a way it wouldn't be for a password, because the input is 32 bytes of CSPRNG
// output rather than something a human chose: there is no dictionary to run against it.
export const hashResetToken = (raw: string) => crypto.createHash('sha256').update(raw).digest('hex');

export const newResetToken = () => crypto.randomBytes(32).toString('hex');
