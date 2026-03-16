import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HeaderBarComponent } from '../../../shared/components/header-bar/header-bar.component';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { TextInputComponent } from '../../../shared/components/text-input/text-input.component';
import { ActionButtonComponent } from '../../../shared/components/action-button/action-button.component';
import { DIALOG_BOX_IMPORTS } from '../../../shared/components/dialog-box/dialog-box.component';
import { UserService } from '../../../core/services/user.service';
import { UserMe } from '../../../core/models/user.models';
import { environment } from '../../../../environments/environment';
import { extractApiErrorMessage } from '../../../core/utils/api-error.util';

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
  private readonly userService = inject(UserService);
  private readonly router = inject(Router);

  activeTab: 'account' | 'password' | 'linked-accounts' = 'account';

  displayName = '';
  username = '';
  bio = '';
  email = '';
  currentPassword = '';
  newPassword = '';

  readonly isLoading = signal(false);
  readonly isSaving = signal(false);
  readonly isDeleting = signal(false);
  readonly isDeleteDialogOpen = signal(false);
  readonly isPasswordDialogOpen = signal(false);
  readonly isChangingPassword = signal(false);
  readonly savingProvider = signal<string | null>(null);
  readonly statusMessage = signal<{ type: 'error' | 'success'; text: string } | null>(null);

  private userMe: UserMe | null = null;

  async ngOnInit() {
    this.isLoading.set(true);
    try {
      const me = await firstValueFrom(this.userService.getMe());
      this.populateForm(me);
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
    this.currentPassword = '';
    this.newPassword = '';
    this.isPasswordDialogOpen.set(true);
  }

  closeChangePasswordDialog() {
    if (!this.isChangingPassword()) {
      this.isPasswordDialogOpen.set(false);
    }
  }

  async changePassword() {
    if (!this.currentPassword || !this.newPassword) return;

    this.isChangingPassword.set(true);
    try {
      // NOTE: Here you would call your backend API to change the password
      // await firstValueFrom(this.userService.changePassword(...));

      // Simulate network request
      await new Promise((resolve) => setTimeout(resolve, 1000));

      this.statusMessage.set({ type: 'success', text: 'Password changed successfully.' });
      this.isPasswordDialogOpen.set(false);
    } catch (error: unknown) {
      this.statusMessage.set({
        type: 'error',
        text: extractApiErrorMessage(error, 'Could not change password.'),
      });
    } finally {
      this.isChangingPassword.set(false);
    }
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
