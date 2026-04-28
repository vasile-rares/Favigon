import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  effect,
  inject,
  input,
} from '@angular/core';
import gsap from 'gsap';

@Component({
  selector: 'app-canvas-loading-overlay',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './canvas-loading-overlay.component.html',
  styleUrl: './canvas-loading-overlay.component.css',
})
export class CanvasLoadingOverlayComponent implements AfterViewInit {
  private readonly hostEl = inject(ElementRef<HTMLElement>);

  readonly message = input('');
  readonly percent = input(0);
  readonly fadingOut = input(false);

  @ViewChild('fill') private fillRef!: ElementRef<HTMLElement>;

  private fillEl: HTMLElement | null = null;

  constructor() {
    effect(() => {
      const p = this.percent();
      if (this.fillEl) {
        gsap.to(this.fillEl, { width: `${p}%`, duration: 0.6, ease: 'power2.out' });
      }
    });

    effect(() => {
      if (this.fadingOut()) {
        gsap.to(this.hostEl.nativeElement, { opacity: 0, duration: 0.4, ease: 'power1.in' });
      }
    });
  }

  ngAfterViewInit(): void {
    this.fillEl = this.fillRef.nativeElement;
    gsap.set(this.hostEl.nativeElement, { opacity: 1 });
    gsap.set(this.fillEl, { width: `${this.percent()}%` });
  }
}
