import { Component, signal } from '@angular/core';
import { FileEditorComponent } from './components/file-editor/file-editor.component';

@Component({
  selector: 'app-root',
  imports: [FileEditorComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly title = signal('Frontend');
}
