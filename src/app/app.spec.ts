import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { AppSnapshot, createInitialSnapshot } from './core/models';
import { PlatformBookmarkRepository } from './core/repository';

class MemoryRepository {
  private snapshot: AppSnapshot | null = createInitialSnapshot();

  load(): Promise<AppSnapshot | null> {
    return Promise.resolve(this.snapshot);
  }

  save(snapshot: AppSnapshot): Promise<void> {
    this.snapshot = snapshot;
    return Promise.resolve();
  }
}

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [{ provide: PlatformBookmarkRepository, useClass: MemoryRepository }],
    }).compileComponents();
  });

  it('creates the application shell', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('LinkDeck');
  });
});
