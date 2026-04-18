import { Component, Directive, HostBinding, input } from '@angular/core';

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
  imports: [],
  templateUrl: './alert.component.html',
  styleUrls: ['./alert.component.css'],
})
export class AlertComponent {
  readonly variant = input<'default' | 'destructive' | 'success'>('default');
}
