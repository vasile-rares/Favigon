import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  OnDestroy,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { UserService, FALLBACK_AVATAR_URL } from '@app/core';
import type { UserFollowItem } from '@app/core';

export type FollowListType = 'followers' | 'following';

@Component({
  selector: 'app-follow-list-modal',
  standalone: true,
  imports: [],
  templateUrl: './follow-list-modal.component.html',
  styleUrl: './follow-list-modal.component.css',
})
export class FollowListModalComponent implements OnInit, OnDestroy {
  private readonly userService = inject(UserService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly username = input.required<string>();
  readonly listType = input.required<FollowListType>();
  readonly closed = output<void>();

  readonly users = signal<UserFollowItem[]>([]);
  readonly isLoading = signal(true);
  readonly isClosing = signal(false);

  readonly title = computed(() => (this.listType() === 'followers' ? 'Followers' : 'Following'));

  readonly fallbackAvatar = FALLBACK_AVATAR_URL;

  private closeTimeoutId: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    document.body.style.overflow = 'hidden';
    const request$ =
      this.listType() === 'followers'
        ? this.userService.getFollowers(this.username())
        : this.userService.getFollowing(this.username());

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (list) => {
        this.users.set(list);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
  }

  ngOnDestroy(): void {
    document.body.style.overflow = '';
    if (this.closeTimeoutId !== null) {
      clearTimeout(this.closeTimeoutId);
    }
  }

  close(): void {
    if (this.isClosing()) return;
    this.isClosing.set(true);
    this.closeTimeoutId = setTimeout(() => {
      this.closed.emit();
    }, 200);
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  navigateToProfile(username: string): void {
    void this.router.navigate(['/', username]);
    this.closed.emit();
  }

  getAvatarUrl(user: UserFollowItem): string {
    return user.profilePictureUrl ?? this.fallbackAvatar;
  }
}
