import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
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

function passwordStrengthValidator(): ValidatorFn {
  const pattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

  return (control: AbstractControl): ValidationErrors | null => {
    const value = String(control.value ?? '');
    if (!value) {
      return null;
    }

    return pattern.test(value) ? null : { weakPassword: true };
  };
}

function confirmPasswordValidator(passwordControlName: string): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (!control.parent) {
      return null;
    }

    const password = control.parent.get(passwordControlName)?.value;
    const confirmPassword = control.value;

    return password === confirmPassword ? null : { passwordMismatch: true };
  };
}

@Component({
  selector: 'app-auth-page',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './auth-page.component.html',
  styleUrl: './auth-page.component.css',
})
export class AuthPage {
  private readonly authService = inject(AuthService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly router = inject(Router);

  readonly mode = signal<'login' | 'register'>('login');
  readonly isSubmitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly showPassword = signal(false);

  readonly loginForm = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(100)]],
    password: ['', [Validators.required, Validators.maxLength(100)]],
    rememberMe: [false],
  });

  readonly registerForm = this.formBuilder.nonNullable.group({
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
    confirmPassword: [
      '',
      [Validators.required, Validators.maxLength(100), confirmPasswordValidator('password')],
    ],
  });

  private readonly rememberedEmailKey = 'prismatic.rememberedEmail';

  constructor() {
    const rememberedEmail = localStorage.getItem(this.rememberedEmailKey);
    if (rememberedEmail) {
      this.loginForm.patchValue({
        email: rememberedEmail,
        rememberMe: true,
      });
    }

    this.registerForm.controls.password.valueChanges.subscribe(() => {
      this.registerForm.controls.confirmPassword.updateValueAndValidity({ emitEvent: false });
    });
  }

  switchMode(nextMode: 'login' | 'register') {
    this.mode.set(nextMode);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.showPassword.set(false);
  }

  togglePasswordVisibility() {
    this.showPassword.update((v) => !v);
  }

  async submitLogin() {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    const payload = this.loginForm.getRawValue();

    try {
      const response = await firstValueFrom(
        this.authService.login({
          email: payload.email.trim(),
          password: payload.password,
        }),
      );

      if (payload.rememberMe) {
        localStorage.setItem(this.rememberedEmailKey, payload.email.trim());
      } else {
        localStorage.removeItem(this.rememberedEmailKey);
      }

      this.successMessage.set(response.message || 'Login reușit.');
      this.router.navigate(['/dashboard']);
    } catch (error) {
      this.errorMessage.set(this.mapAuthError(error, 'Nu am putut face login.'));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async submitRegister() {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    const payload = this.registerForm.getRawValue();

    try {
      const response = await firstValueFrom(
        this.authService.register({
          displayName: payload.displayName.trim(),
          username: payload.username.trim(),
          email: payload.email.trim(),
          password: payload.password,
        }),
      );

      this.successMessage.set(response.message || 'Cont creat cu succes.');
      this.switchMode('login');
      this.loginForm.patchValue({
        email: payload.email.trim(),
      });
    } catch (error) {
      this.errorMessage.set(this.mapAuthError(error, 'Nu am putut crea contul.'));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private mapAuthError(error: unknown, fallback: string): string {
    if (!(error instanceof HttpErrorResponse)) {
      return fallback;
    }

    if (typeof error.error?.message === 'string' && error.error.message.trim().length > 0) {
      return error.error.message;
    }

    if (error.status === 400) {
      return 'Datele trimise nu sunt valide.';
    }

    if (error.status === 401) {
      return 'Email sau parolă incorectă.';
    }

    if (error.status === 409) {
      return 'Există deja un cont cu aceste date.';
    }

    return fallback;
  }
}
