import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  NgZone,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ProjectService, extractApiErrorMessage } from '@app/core';
import gsap from 'gsap';

@Component({
  selector: 'app-create-project-dialog',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './create-project-dialog.component.html',
  styleUrl: './create-project-dialog.component.css',
})
export class CreateProjectDialogComponent implements AfterViewInit {
  readonly closed = output<void>();

  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly projectService = inject(ProjectService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly zone = inject(NgZone);

  private readonly modalRef = viewChild<ElementRef<HTMLElement>>('modal');
  private readonly backdropRef = viewChild<ElementRef<HTMLElement>>('backdrop');

  readonly isCreating = signal(false);
  readonly error = signal<string | null>(null);

  readonly formId = 'create-project-dialog-form';

  readonly form = this.fb.nonNullable.group({
    name: ['Untitled Project', [Validators.required, Validators.maxLength(120)]],
    isPublic: [false],
  });

  ngAfterViewInit(): void {
    const modal = this.modalRef()?.nativeElement;
    if (!modal) return;
    this.zone.runOutsideAngular(() => {
      gsap.fromTo(
        modal,
        { opacity: 0, scale: 0.92, y: 12, transformOrigin: 'center center' },
        {
          opacity: 1,
          scale: 1,
          y: 0,
          duration: 0.25,
          ease: 'back.out(1.7)',
          clearProps: 'transform',
        },
      );
    });
  }

  private animateClose(onDone: () => void): void {
    const modal = this.modalRef()?.nativeElement;
    const backdrop = this.backdropRef()?.nativeElement;
    if (!modal && !backdrop) {
      onDone();
      return;
    }
    this.zone.runOutsideAngular(() => {
      const tl = gsap.timeline({ onComplete: () => this.zone.run(onDone) });
      if (modal) {
        tl.to(
          modal,
          {
            opacity: 0,
            scale: 0.92,
            y: 12,
            duration: 0.17,
            ease: 'power2.in',
            transformOrigin: 'center center',
          },
          0,
        );
      }
      if (backdrop) {
        tl.to(backdrop, { opacity: 0, duration: 0.17, ease: 'power2.in' }, 0);
      }
    });
  }

  close(): void {
    if (this.isCreating()) return;
    this.animateClose(() => this.closed.emit());
  }

  submit(): void {
    if (this.form.invalid || this.isCreating()) {
      this.form.markAllAsTouched();
      return;
    }

    this.isCreating.set(true);
    this.error.set(null);
    const { name, isPublic } = this.form.getRawValue();

    this.projectService
      .create({ name: name.trim(), isPublic })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (project) => {
          this.isCreating.set(false);
          this.animateClose(() => {
            this.closed.emit();
            void this.router.navigate(['/project', project.slug]);
          });
        },
        error: (err: unknown) => {
          this.error.set(extractApiErrorMessage(err, 'Failed to create project.'));
          this.isCreating.set(false);
        },
      });
  }
}
