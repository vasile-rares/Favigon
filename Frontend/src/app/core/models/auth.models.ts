export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  displayName: string;
  username: string;
  email: string;
  password: string;
}

export interface GithubAuthRequest {
  code: string;
}

export interface GoogleAuthRequest {
  code: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
}

export interface SetPasswordRequest {
  password: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface TwoFactorCodeRequest {
  code: string;
}

export interface TwoFactorLoginVerifyRequest {
  token: string;
  code: string;
}

export interface AuthMessageResponse {
  message: string;
  requiresTwoFactor?: boolean;
  twoFactorToken?: string | null;
  twoFactorEmailHint?: string | null;
}
