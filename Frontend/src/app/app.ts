import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PendingProjectFlushService } from '@app/core';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly pendingProjectFlush = inject(PendingProjectFlushService);
}
