export function validateEmail(email: string): { valid: boolean; message: string } {
  const trimmed = email.trim();
  if (!trimmed) {
    return { valid: false, message: 'Ingresa tu email.' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { valid: false, message: 'Formato de email inválido.' };
  }
  return { valid: true, message: '' };
}

export function validatePassword(password: string): { valid: boolean; message: string } {
  if (password.length < 8) {
    return { valid: false, message: 'La contraseña debe tener al menos 8 caracteres.' };
  }
  if (!/[0-9]/.test(password) && !/[^a-zA-Z0-9]/.test(password)) {
    return { valid: false, message: 'Incluye al menos un número o símbolo.' };
  }
  return { valid: true, message: '' };
}

export function sanitizeText(text: string, maxLength: number = 500): string {
  return text.trim().slice(0, maxLength).replace(/[<>]/g, '');
}
