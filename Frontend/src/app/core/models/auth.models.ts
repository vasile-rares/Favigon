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

export interface AuthMessageResponse {
  message: string;
}