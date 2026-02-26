import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HeaderBarComponent } from '../../components/ui/header-bar/header-bar.component';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [CommonModule, HeaderBarComponent, FormsModule],
  templateUrl: './settings-page.component.html',
  styleUrl: './settings-page.component.css',
})
export class SettingsPage {
  activeTab: 'account' | 'password' = 'account';

  setActiveTab(tab: 'account' | 'password') {
    this.activeTab = tab;
  }
}
