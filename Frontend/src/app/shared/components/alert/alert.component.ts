import { Component, Directive, Input, HostBinding } from '@angular/core';
import { CommonModule } from '@angular/common';

@Directive({
  selector: '[appAlertTitle]',
  standalone: true,
})
export class AlertTitleDirective {
  @HostBinding('class') get classes() {
    return 'alert-title mb-1 font-medium leading-none tracking-tight';
  }
}

@Directive({
  selector: '[appAlertDescription]',
  standalone: true,
})
export class AlertDescriptionDirective {
  @HostBinding('class') get classes() {
    return 'alert-description text-sm [&_p]:leading-relaxed';
  }
}

@Component({
  selector: 'app-alert',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './alert.component.html',
  styleUrls: ['./alert.component.css'],
})
export class AlertComponent {
  @Input() variant: 'default' | 'destructive' | 'success' = 'default';
}
