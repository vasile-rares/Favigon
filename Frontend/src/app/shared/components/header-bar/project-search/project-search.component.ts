import { Component, ElementRef, ViewChild, inject, signal, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { UserService } from '@app/core';
import type { UserSearchResult } from '@app/core';
import { Subject, of, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-project-search',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './project-search.component.html',
  styleUrl: './project-search.component.css',
})
export class ProjectSearchComponent {
  private readonly router = inject(Router);
  private readonly userService = inject(UserService);
  private readonly searchSubject = new Subject<string>();

  readonly searchQuery = signal('');
  readonly searchResults = signal<UserSearchResult[]>([]);
  readonly isSearchOpen = signal(false);
  readonly isSearchLoading = signal(false);

  @ViewChild('searchContainer') searchContainer?: ElementRef<HTMLElement>;

  constructor() {
    this.searchSubject
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((query) => {
          if (query.trim().length < 2) {
            this.searchResults.set([]);
            this.isSearchLoading.set(false);
            return of([] as UserSearchResult[]);
          }
          this.isSearchLoading.set(true);
          return this.userService.search(query);
        }),
        takeUntilDestroyed(),
      )
      .subscribe({
        next: (results) => {
          this.searchResults.set(results);
          this.isSearchLoading.set(false);
        },
        error: () => {
          this.searchResults.set([]);
          this.isSearchLoading.set(false);
        },
      });
  }

  onSearchInput(query: string): void {
    this.searchQuery.set(query);
    this.searchSubject.next(query);
    if (query.trim().length > 0) {
      this.isSearchOpen.set(true);
    } else {
      this.isSearchOpen.set(false);
      this.searchResults.set([]);
    }
  }

  onSearchFocus(): void {
    if (this.searchQuery().trim().length >= 2) {
      this.isSearchOpen.set(true);
    }
  }

  clearSearch(): void {
    this.searchQuery.set('');
    this.searchResults.set([]);
    this.isSearchOpen.set(false);
    this.searchSubject.next('');
  }

  selectSearchResult(result: UserSearchResult): void {
    this.searchQuery.set('');
    this.searchResults.set([]);
    this.isSearchOpen.set(false);
    void this.router.navigate(['/', result.username]);
  }

  closeIfClickedOutside(target: Node): void {
    const searchEl = this.searchContainer?.nativeElement;
    if (target && searchEl && !searchEl.contains(target)) {
      this.isSearchOpen.set(false);
    }
  }

  closeDropdown(): void {
    this.isSearchOpen.set(false);
  }
}
