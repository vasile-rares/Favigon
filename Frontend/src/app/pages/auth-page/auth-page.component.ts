import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';

const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const EMAIL_MAX_LENGTH = 100;

/**
 * Validates password complexity:
 * - Minimum 8 characters
 * - At least one lowercase letter
 * - At least one uppercase letter
 * - At least one digit
 */
function passwordStrengthValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (!control.value) {
      return null; // Let 'required' validator handle empty case
    }
    return PASSWORD_PATTERN.test(String(control.value)) ? null : { weakPassword: true };
  };
}

@Component({
  selector: 'app-auth-page',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './auth-page.component.html',
  styleUrl: './auth-page.component.css',
})
export class AuthPage implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private static readonly REMEMBER_EMAIL_KEY = 'prismatic.rememberedEmail';

  // --- State Signals ---
  readonly mode = signal<'login' | 'register'>('login');
  readonly isSubmitting = signal(false);
  readonly statusMessage = signal<{ type: 'error' | 'success'; text: string } | null>(null);
  readonly showPassword = signal(false);

  // --- Forms ---
  readonly loginForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(100)]],
    password: ['', [Validators.required, Validators.maxLength(100)]],
    rememberMe: [false],
  });

  readonly registerForm = this.fb.nonNullable.group(
    {
      displayName: ['', [Validators.required, Validators.maxLength(50)]],
      username: [
        '',
        [Validators.required, Validators.maxLength(30), Validators.pattern(/^[a-z0-9_]+$/)],
      ],
      email: ['', [Validators.required, Validators.email, Validators.maxLength(100)]],
      password: [
        '',
        [
          Validators.required,
          Validators.minLength(8),
          Validators.maxLength(100),
          passwordStrengthValidator(),
        ],
      ],
      confirmPassword: ['', [Validators.required, Validators.maxLength(100)]],
    },
    { validators: [this.passwordMatchValidator] },
  );

  ngOnInit() {
    this.checkRememberedEmail();
    void this.tryGithubCallbackLogin();
  }

  // --- Actions ---

  switchMode(nextMode: 'login' | 'register') {
    this.mode.set(nextMode);

    // Reset UI state
    this.statusMessage.set(null);
    this.showPassword.set(false);

    // Reset forms
    this.loginForm.reset();
    this.registerForm.reset();

    if (nextMode === 'login') {
      this.checkRememberedEmail();
    }
  }

  togglePasswordVisibility() {
    this.showPassword.update((v) => !v);
  }

  async submitLogin() {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.startLoading();
    const { email, password, rememberMe } = this.loginForm.getRawValue();

    try {
      const response = await firstValueFrom(
        this.authService.login({
          email: email.trim(),
          password,
        }),
      );

      this.handleRememberMe(email.trim(), rememberMe);
      this.statusMessage.set({ type: 'success', text: response.message || 'Login successful.' });
      await this.router.navigate(['/dashboard']);
    } catch (error: any) {
      this.handleError(error, 'Could not log in.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async submitRegister() {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    this.startLoading();
    const { displayName, username, email, password } = this.registerForm.getRawValue();

    try {
      const response = await firstValueFrom(
        this.authService.register({
          displayName: displayName.trim(),
          username: username.trim(),
          email: email.trim(),
          password,
        }),
      );

      this.statusMessage.set({
        type: 'success',
        text: response.message || 'Account created successfully.',
      });

      // Auto-switch to login and pre-fill email
      this.switchMode('login');
      this.loginForm.patchValue({ email: email.trim() });
    } catch (error: any) {
      this.handleError(error, 'Could not create account.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  startGithubLogin() {
    const clientId = environment.githubClientId?.trim();
    if (!clientId) {
      this.statusMessage.set({
        type: 'error',
        text: 'GitHub login is not configured in frontend environment.',
      });
      return;
    }

    const redirectUri = `${window.location.origin}/login`;
    const githubAuthorizeUrl =
      `https://github.com/login/oauth/authorize` +
      `?client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent('read:user user:email')}`;

    window.location.href = githubAuthorizeUrl;
  }

  // --- Private Helpers ---

  /** Cross-field validator for password matching attached to the FormGroup */
  private passwordMatchValidator(group: AbstractControl): ValidationErrors | null {
    const password = group.get('password')?.value;
    const confirmControl = group.get('confirmPassword');

    if (!confirmControl) return null;

    const confirmValue = confirmControl.value;

    // Only set error if confirm field has content but doesn't match
    if (confirmValue && password !== confirmValue) {
      confirmControl.setErrors({ ...confirmControl.errors, passwordMismatch: true });
      return { passwordMismatch: true };
    }

    // Remove error if they match now
    if (confirmControl.hasError('passwordMismatch')) {
      const { passwordMismatch, ...otherErrors } = confirmControl.errors || {};
      confirmControl.setErrors(Object.keys(otherErrors).length ? otherErrors : null);
    }

    return null;
  }

  private checkRememberedEmail() {
    const savedEmail = localStorage.getItem(AuthPage.REMEMBER_EMAIL_KEY);
    if (savedEmail) {
      this.loginForm.patchValue({ email: savedEmail, rememberMe: true });
    }
  }

  private handleRememberMe(email: string, shouldRemember: boolean) {
    if (shouldRemember) {
      localStorage.setItem(AuthPage.REMEMBER_EMAIL_KEY, email);
    } else {
      localStorage.removeItem(AuthPage.REMEMBER_EMAIL_KEY);
    }
  }

  private startLoading() {
    this.isSubmitting.set(true);
    this.statusMessage.set(null);
  }

  private async tryGithubCallbackLogin() {
    const code = this.route.snapshot.queryParamMap.get('code');
    if (!code) {
      return;
    }

    this.startLoading();

    try {
      await firstValueFrom(this.authService.loginWithGithub({ code }));
      await this.router.navigate(['/dashboard']);
    } catch (error: any) {
      this.handleError(error, 'Could not authenticate with GitHub.');
      await this.router.navigate(['/login'], { replaceUrl: true });
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private handleError(error: any, defaultMsg: string) {
    const msg = error.error?.message || error.error?.title || defaultMsg;
    this.statusMessage.set({ type: 'error', text: msg });
  }
}
