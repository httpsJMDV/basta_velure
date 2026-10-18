// Account creation, email verification, account security and rider activation (docs/api/accounts.md).
import { http } from './client';
import type { User } from '../types';

export interface RegistrationResult {
  message: string;
  verification_required: true;
  email: string;
}

/** Creates an unverified account and emails a 6-digit code. No token until the code is entered. */
export const registerAccountApi = (payload: Record<string, string | boolean>) =>
  http.post<RegistrationResult>('/auth/register', payload).then((r) => r.data);

/** A visitor's seller application (account + shop in one form). */
export const registerSellerApi = (form: FormData) =>
  http.post<RegistrationResult>('/auth/register-seller', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);

/** A visitor's courier company application (contact person's account + company). */
export const registerCourierApi = (form: FormData) =>
  http.post<RegistrationResult>('/auth/register-courier', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);

export const verifyEmailApi = (email: string, code: string) =>
  http.post<{ message: string; data: User; token: string }>('/auth/verify-email', { email, code }).then((r) => r.data);

export const resendVerificationApi = (email: string) =>
  http.post<{ message: string; expires_in?: number }>('/auth/resend-verification', { email }).then((r) => r.data);

export const changePasswordApi = (payload: { current_password: string; password: string; password_confirmation: string }) =>
  http.post<{ message: string }>('/auth/change-password', payload).then((r) => r.data);

export const requestEmailChangeApi = (email: string) =>
  http.post<{ message: string; pending_email: string; expires_in: number }>('/auth/email-change', { email }).then((r) => r.data);

export const confirmEmailChangeApi = (code: string) =>
  http.post<{ message: string; data: User }>('/auth/email-change/confirm', { code }).then((r) => r.data);

export const requestPhoneChangeApi = (phone: string) =>
  http.post<{ message: string; pending_phone: string; expires_in: number }>('/auth/phone-change', { phone }).then((r) => r.data);

export const confirmPhoneChangeApi = (code: string) =>
  http.post<{ message: string; data: User }>('/auth/phone-change/confirm', { code }).then((r) => r.data);

export interface RiderActivationInfo {
  name: string;
  email: string;
  company: string | null;
  expires_at: string | null;
}

export const getRiderActivationApi = (token: string) =>
  http.get<{ data: RiderActivationInfo }>('/auth/rider-activation', { params: { token } }).then((r) => r.data.data);

export const activateRiderApi = (token: string, password: string, password_confirmation: string) =>
  http.post<{ message: string }>('/auth/rider-activation', { token, password, password_confirmation }).then((r) => r.data);
