// The sign-in forms take ONE field: an email or a username. The server treats an unknown or malformed value like a
// wrong password, so this only catches typing mistakes before a request is sent.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[A-Za-z0-9._-]{2,50}$/;

/** An error message for the "Email or username" field, or null when the value can be sent. */
export function validateLoginIdentifier(value: string): string | null {
  const identifier = value.trim();
  if (!identifier) return 'Enter your email or username.';
  if (identifier.length > 255) return 'That is too long to be an email or username.';
  if (/\s/.test(identifier)) return 'Email or username cannot contain spaces.';
  if (identifier.includes('@')) {
    return EMAIL_PATTERN.test(identifier) ? null : 'Enter a valid email address.';
  }
  return USERNAME_PATTERN.test(identifier)
    ? null
    : 'A username has letters, numbers, dots, dashes or underscores only.';
}
