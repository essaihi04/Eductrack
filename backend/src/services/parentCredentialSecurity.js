export function passwordPolicy(value) {
  const password = String(value || '');
  return {
    length: password.length >= 8,
    letter: /[A-Za-z]/.test(password),
    number: /\d/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };
}

export function isStrongPassword(value) {
  return Object.values(passwordPolicy(value)).every(Boolean);
}
