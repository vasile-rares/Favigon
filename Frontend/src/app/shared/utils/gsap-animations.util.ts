import { NgZone } from '@angular/core';
import gsap from 'gsap';

export function gsapFadeIn(zone: NgZone, element: HTMLElement, onComplete?: () => void): void {
  zone.runOutsideAngular(() => {
    gsap.fromTo(
      element,
      { opacity: 0, scale: 0.92, y: 12, transformOrigin: 'center center' },
      {
        opacity: 1,
        scale: 1,
        y: 0,
        duration: 0.25,
        ease: 'back.out(1.7)',
        clearProps: 'transform',
        onComplete: onComplete ? () => zone.run(onComplete) : undefined,
      },
    );
  });
}

export function gsapFadeOut(zone: NgZone, element: HTMLElement, onComplete: () => void): void {
  zone.runOutsideAngular(() => {
    gsap.to(element, {
      opacity: 0,
      scale: 0.92,
      y: 12,
      duration: 0.17,
      ease: 'power2.in',
      transformOrigin: 'center center',
      onComplete: () => zone.run(onComplete),
    });
  });
}
