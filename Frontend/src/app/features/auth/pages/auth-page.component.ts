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
import { AuthService } from '../../../core/services/auth.service';
import { UserService } from '../../../core/services/user.service';
import { CurrentUserService } from '../../../core/services/current-user.service';
import { environment } from '../../../../environments/environment';
import { extractApiErrorMessage } from '../../../core/utils/api-error.util';
import { TextInputComponent } from '../../../shared/components/text-input/text-input.component';
import { ActionButtonComponent } from '../../../shared/components/action-button/action-button.component';
import { DIALOG_BOX_IMPORTS } from '../../../shared/components/dialog-box/dialog-box.component';

const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const CREDENTIAL_MAX_LENGTH = 100;

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
  imports: [ReactiveFormsModule, ...DIALOG_BOX_IMPORTS, TextInputComponent, ActionButtonComponent],
  templateUrl: './auth-page.component.html',
  styleUrl: './auth-page.component.css',
})
export class AuthPage implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly userService = inject(UserService);
  private readonly currentUser = inject(CurrentUserService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private static readonly REMEMBER_EMAIL_KEY = 'favigon.rememberedEmail';

  // --- State Signals ---
  readonly mode = signal<'login' | 'register'>('login');
  readonly isSubmitting = signal(false);
  readonly isForgotPasswordSubmitting = signal(false);
  readonly isForgotPasswordDialogOpen = signal(false);
  readonly forgotPasswordEmailSent = signal(false);
  readonly forgotPasswordStatusMessage = signal<{ type: 'error' | 'success'; text: string } | null>(
    null,
  );
  readonly statusMessage = signal<{ type: 'error' | 'success'; text: string } | null>(null);

  // --- Forms ---
  readonly loginForm = this.fb.nonNullable.group({
    email: [
      '',
      [Validators.required, Validators.email, Validators.maxLength(CREDENTIAL_MAX_LENGTH)],
    ],
    password: ['', [Validators.required, Validators.maxLength(CREDENTIAL_MAX_LENGTH)]],
    rememberMe: [false],
  });

  readonly forgotPasswordForm = this.fb.nonNullable.group({
    email: [
      '',
      [Validators.required, Validators.email, Validators.maxLength(CREDENTIAL_MAX_LENGTH)],
    ],
  });

  readonly registerForm = this.fb.nonNullable.group(
    {
      displayName: ['', [Validators.required, Validators.maxLength(50)]],
      username: [
        '',
        [Validators.required, Validators.maxLength(30), Validators.pattern(/^[a-z0-9_]+$/)],
      ],
      email: [
        '',
        [Validators.required, Validators.email, Validators.maxLength(CREDENTIAL_MAX_LENGTH)],
      ],
      password: [
        '',
        [
          Validators.required,
          Validators.minLength(8),
          Validators.maxLength(CREDENTIAL_MAX_LENGTH),
          passwordStrengthValidator(),
        ],
      ],
      confirmPassword: ['', [Validators.required, Validators.maxLength(CREDENTIAL_MAX_LENGTH)]],
    },
    { validators: [this.passwordMatchValidator] },
  );

  ngOnInit() {
    this.checkRememberedEmail();
    void this.tryOAuthCallbackLogin();
  }

  // --- Actions ---

  switchMode(nextMode: 'login' | 'register') {
    this.mode.set(nextMode);

    // Reset UI state
    this.statusMessage.set(null);

    // Reset forms
    this.loginForm.reset();
    this.forgotPasswordForm.reset();
    this.registerForm.reset();

    if (nextMode === 'login') {
      this.checkRememberedEmail();
    }
  }

  openForgotPasswordDialog() {
    this.forgotPasswordStatusMessage.set(null);
    this.forgotPasswordEmailSent.set(false);
    this.forgotPasswordForm.reset({
      email: this.loginForm.controls.email.value?.trim() ?? '',
    });
    this.isForgotPasswordDialogOpen.set(true);
  }

  closeForgotPasswordDialog() {
    if (this.isForgotPasswordSubmitting()) {
      return;
    }

    this.isForgotPasswordDialogOpen.set(false);
  }

  async submitForgotPassword() {
    if (this.forgotPasswordForm.invalid) {
      this.forgotPasswordForm.markAllAsTouched();
      return;
    }

    this.isForgotPasswordSubmitting.set(true);
    this.forgotPasswordStatusMessage.set(null);

    try {
      const { email } = this.forgotPasswordForm.getRawValue();
      const response = await firstValueFrom(
        this.authService.forgotPassword({
          email: email.trim(),
        }),
      );

      this.forgotPasswordEmailSent.set(true);
      this.forgotPasswordStatusMessage.set({
        type: 'success',
        text:
          response.message ||
          'If an account exists for this email, a password reset email has been sent. Please check your inbox.',
      });
    } catch (error: unknown) {
      this.forgotPasswordStatusMessage.set({
        type: 'error',
        text: extractApiErrorMessage(error, 'Could not send password reset email.'),
      });
    } finally {
      this.isForgotPasswordSubmitting.set(false);
    }
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
      const user = await firstValueFrom(this.userService.getMe());
      this.currentUser.set(user);
      await this.navigateAfterLogin(user.username);
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
      `&scope=${encodeURIComponent('read:user user:email')}` +
      `&state=${encodeURIComponent('github')}` +
      `&prompt=select_account`;

    window.location.href = githubAuthorizeUrl;
  }

  startGoogleLogin() {
    const clientId = environment.googleClientId?.trim();
    if (!clientId) {
      this.statusMessage.set({
        type: 'error',
        text: 'Google login is not configured in frontend environment.',
      });
      return;
    }

    const redirectUri = `${window.location.origin}/login`;
    const googleAuthorizeUrl =
      `https://accounts.google.com/o/oauth2/v2/auth` +
      `?client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=${encodeURIComponent('code')}` +
      `&scope=${encodeURIComponent('openid email profile')}` +
      `&prompt=${encodeURIComponent('select_account')}` +
      `&state=${encodeURIComponent('google')}`;

    window.location.href = googleAuthorizeUrl;
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

  private async tryOAuthCallbackLogin() {
    const code = this.route.snapshot.queryParamMap.get('code');
    if (!code) {
      return;
    }

    const state = this.route.snapshot.queryParamMap.get('state')?.trim().toLowerCase();

    if (state === 'github-link' || state === 'google-link') {
      this.startLoading();
      try {
        if (state === 'google-link') {
          await firstValueFrom(this.authService.linkWithGoogle({ code }));
        } else {
          await firstValueFrom(this.authService.linkWithGithub({ code }));
        }
        await this.router.navigate(['/settings']);
      } catch (error: any) {
        this.handleError(
          error,
          state === 'google-link'
            ? 'Could not link Google account.'
            : 'Could not link GitHub account.',
        );
        await this.router.navigate(['/settings'], { replaceUrl: true });
      } finally {
        this.isSubmitting.set(false);
      }
      return;
    }

    this.startLoading();

    try {
      if (state == 'google') {
        await firstValueFrom(this.authService.loginWithGoogle({ code }));
      } else {
        await firstValueFrom(this.authService.loginWithGithub({ code }));
      }

      const user = await firstValueFrom(this.userService.getMe());
      this.currentUser.set(user);
      await this.navigateAfterLogin(user.username);
    } catch (error: any) {
      this.handleError(
        error,
        state === 'google'
          ? 'Could not authenticate with Google.'
          : 'Could not authenticate with GitHub.',
      );
      await this.router.navigate(['/login'], { replaceUrl: true });
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private handleError(error: any, defaultMsg: string) {
    this.statusMessage.set({ type: 'error', text: extractApiErrorMessage(error, defaultMsg) });
  }

  private navigateAfterLogin(username: string): Promise<boolean> {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl')?.trim() ?? '';

    if (returnUrl.startsWith('/') && returnUrl !== '/login') {
      return this.router.navigateByUrl(returnUrl, { replaceUrl: true });
    }

    return this.router.navigate(['/', username], { replaceUrl: true });
  }
}
