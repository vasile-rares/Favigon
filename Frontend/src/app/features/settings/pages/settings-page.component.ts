import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HeaderBarComponent } from '../../../shared/components/header-bar/header-bar.component';
import { FormsModule } from '@angular/forms';
import { TextInputComponent } from '../../../shared/components/input/text-input.component';
import { ActionButtonComponent } from '../../../shared/components/button/action-button.component';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [
    CommonModule,
    HeaderBarComponent,
    FormsModule,
    TextInputComponent,
    ActionButtonComponent,
  ],
  templateUrl: './settings-page.component.html',
  styleUrl: './settings-page.component.css',
})
export class SettingsPage {
  activeTab: 'account' | 'password' = 'account';
  accountName = 'Michael Brown';
  accountEmail = 'michael.brown@example.com';
  currentPassword = '';
  newPassword = '';

  setActiveTab(tab: 'account' | 'password') {
    this.activeTab = tab;
  }
}
