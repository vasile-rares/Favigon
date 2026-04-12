import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService, UserService, CurrentUserService, extractApiErrorMessage } from '@app/core';
import type { UserMe } from '@app/core';
import { environment } from '../../../../environments/environment';
import {
  HeaderBarComponent,
  TextInputComponent,
  ActionButtonComponent,
  DIALOG_BOX_IMPORTS,
} from '@app/shared';

const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [
    CommonModule,
    HeaderBarComponent,
    FormsModule,
    TextInputComponent,
    ActionButtonComponent,
    ...DIALOG_BOX_IMPORTS,
  ],
  templateUrl: './settings-page.component.html',
  styleUrl: './settings-page.component.css',
})
export class SettingsPage implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly userService = inject(UserService);
  private readonly currentUser = inject(CurrentUserService);
  private readonly router = inject(Router);

  activeTab: 'account' | 'password' | 'linked-accounts' = 'account';

  displayName = '';
  username = '';
  bio = '';
  email = '';
  currentPassword = '';
  newPassword = '';
  confirmPassword = '';
  passwordDialogMode: 'set' | 'change' = 'change';

  readonly isLoading = signal(false);
  readonly isSaving = signal(false);
  readonly isDeleting = signal(false);
  readonly isDeleteDialogOpen = signal(false);
  readonly isPasswordDialogOpen = signal(false);
  readonly isChangingPassword = signal(false);
  readonly isPasswordDialogSuccess = signal(false);
  readonly savingProvider = signal<string | null>(null);
  readonly statusMessage = signal<{ type: 'error' | 'success'; text: string } | null>(null);
  readonly passwordDialogMessage = signal<{ type: 'error' | 'success'; text: string } | null>(null);

  private userMe: UserMe | null = null;

  async ngOnInit() {
    this.isLoading.set(true);
    try {
      const me = await firstValueFrom(this.currentUser.load());
      if (me) this.populateForm(me);
    } catch {
      // auth guard should handle unauthenticated state
    } finally {
      this.isLoading.set(false);
    }
  }

  setActiveTab(tab: 'account' | 'password' | 'linked-accounts') {
    this.activeTab = tab;
    this.statusMessage.set(null);
  }

  async saveAccountChanges() {
    this.isSaving.set(true);
    this.statusMessage.set(null);
    try {
      const updated = await firstValueFrom(
        this.userService.updateMe({
          displayName: this.displayName.trim(),
          username: this.username.trim(),
          bio: this.bio.trim() || null,
        }),
      );
      this.currentUser.set(updated);
      this.populateForm(updated);
      this.statusMessage.set({ type: 'success', text: 'Profile updated successfully.' });
    } catch (error: unknown) {
      this.statusMessage.set({
        type: 'error',
        text: extractApiErrorMessage(error, 'Could not save changes.'),
      });
    } finally {
      this.isSaving.set(false);
    }
  }

  openDeleteDialog() {
    this.isDeleteDialogOpen.set(true);
  }

  closeDeleteDialog() {
    if (!this.isDeleting()) {
      this.isDeleteDialogOpen.set(false);
    }
  }

  async confirmDeleteAccount() {
    this.isDeleting.set(true);
    try {
      await firstValueFrom(this.userService.deleteMe());
      await this.router.navigate(['/login']);
    } catch (error: unknown) {
      this.statusMessage.set({
        type: 'error',
        text: extractApiErrorMessage(error, 'Could not delete account.'),
      });
      this.isDeleteDialogOpen.set(false);
    } finally {
      this.isDeleting.set(false);
    }
  }

  openChangePasswordDialog() {
    this.passwordDialogMode = this.userMe?.hasPassword ? 'change' : 'set';
    this.currentPassword = '';
    this.newPassword = '';
    this.confirmPassword = '';
    this.statusMessage.set(null);
    this.passwordDialogMessage.set(null);
    this.isPasswordDialogSuccess.set(false);
    this.isPasswordDialogOpen.set(true);
  }

  closeChangePasswordDialog() {
    if (!this.isChangingPassword()) {
      this.isPasswordDialogOpen.set(false);
      this.passwordDialogMessage.set(null);
      this.isPasswordDialogSuccess.set(false);
    }
  }

  async submitPasswordDialog() {
    if (!this.passwordDialogCanSubmit) {
      return;
    }

    this.isChangingPassword.set(true);
    this.passwordDialogMessage.set(null);

    try {
      const response = this.isSetPasswordMode
        ? await firstValueFrom(
            this.authService.setPassword({
              password: this.newPassword,
            }),
          )
        : await firstValueFrom(
            this.authService.changePassword({
              currentPassword: this.currentPassword,
              newPassword: this.newPassword,
            }),
          );

      if (this.userMe && !this.userMe.hasPassword) {
        const updatedUser: UserMe = {
          ...this.userMe,
          hasPassword: true,
        };
        this.currentUser.set(updatedUser);
        this.userMe = updatedUser;
      }

      const successMessage = {
        type: 'success' as const,
        text: response.message ||
          (this.isSetPasswordMode
            ? "You're all set. We've sent a confirmation email to your inbox."
            : 'Password changed successfully.'),
      };

      this.passwordDialogMessage.set(successMessage);
      this.statusMessage.set(successMessage);
      this.isPasswordDialogSuccess.set(true);
    } catch (error: unknown) {
      this.passwordDialogMessage.set({
        type: 'error',
        text: extractApiErrorMessage(
          error,
          this.isSetPasswordMode ? 'Could not set password.' : 'Could not change password.',
        ),
      });
    } finally {
      this.isChangingPassword.set(false);
    }
  }

  get isSetPasswordMode(): boolean {
    return this.passwordDialogMode === 'set';
  }

  get hasLocalPassword(): boolean {
    return this.userMe?.hasPassword ?? true;
  }

  get passwordDialogTitle(): string {
    if (this.isPasswordDialogSuccess()) {
      return this.isSetPasswordMode ? "You're all set" : 'Password changed';
    }

    return this.isSetPasswordMode ? 'Set password' : 'Change password';
  }

  get passwordDialogDescription(): string {
    if (this.isPasswordDialogSuccess()) {
      return this.isSetPasswordMode
        ? "Your sign-in details have been updated. You can now sign in with your email and password, and we've sent a confirmation email to your inbox."
        : 'Your password has been updated successfully.';
    }

    return this.isSetPasswordMode
      ? "Choose a password for your account. We'll send a confirmation email once it's saved."
      : 'Enter your current password and choose a new secure password.';
  }

  get passwordDialogPrimaryLabel(): string {
    if (this.isChangingPassword()) {
      return 'Saving...';
    }

    return this.isSetPasswordMode ? 'Set password' : 'Change password';
  }

  get passwordDialogCanSubmit(): boolean {
    if (this.isPasswordDialogSuccess()) {
      return false;
    }

    if (!this.newPassword || !PASSWORD_PATTERN.test(this.newPassword)) {
      return false;
    }

    if (!this.confirmPassword || this.newPassword !== this.confirmPassword) {
      return false;
    }

    if (!this.isSetPasswordMode && !this.currentPassword) {
      return false;
    }

    return true;
  }

  get passwordDialogValidationMessage(): string | null {
    if (this.newPassword && !PASSWORD_PATTERN.test(this.newPassword)) {
      return 'Password must contain at least one lowercase letter, one uppercase letter, one digit, and be at least 8 characters long.';
    }

    if (this.confirmPassword && this.newPassword !== this.confirmPassword) {
      return 'Passwords do not match.';
    }

    return null;
  }

  getLinkedAccount(provider: string) {
    return this.userMe?.linkedAccounts.find((la) => la.provider === provider) ?? null;
  }

  connectGithub() {
    const clientId = environment.githubClientId?.trim();
    if (!clientId) return;
    const redirectUri = `${window.location.origin}/login`;
    window.location.href =
      `https://github.com/login/oauth/authorize` +
      `?client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent('read:user user:email')}` +
      `&state=${encodeURIComponent('github-link')}` +
      `&prompt=select_account`;
  }

  connectGoogle() {
    const clientId = environment.googleClientId?.trim();
    if (!clientId) return;
    const redirectUri = `${window.location.origin}/login`;
    window.location.href =
      `https://accounts.google.com/o/oauth2/v2/auth` +
      `?client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=${encodeURIComponent('code')}` +
      `&scope=${encodeURIComponent('openid email profile')}` +
      `&prompt=${encodeURIComponent('select_account')}` +
      `&state=${encodeURIComponent('google-link')}`;
  }

  async disconnectProvider(provider: string) {
    this.savingProvider.set(provider);
    this.statusMessage.set(null);
    try {
      await firstValueFrom(this.userService.unlinkProvider(provider));
      if (this.userMe) {
        this.userMe = {
          ...this.userMe,
          linkedAccounts: this.userMe.linkedAccounts.filter((la) => la.provider !== provider),
        };
      }
    } catch (error: unknown) {
      this.statusMessage.set({
        type: 'error',
        text: extractApiErrorMessage(error, `Could not disconnect ${provider} account.`),
      });
    } finally {
      this.savingProvider.set(null);
    }
  }

  private populateForm(me: UserMe) {
    this.userMe = me;
    this.displayName = me.displayName;
    this.username = me.username;
    this.bio = me.bio ?? '';
    this.email = me.email;
  }
}
