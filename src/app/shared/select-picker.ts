import { Component, computed, input, output, signal } from '@angular/core';

export interface SelectPickerOption {
  readonly value: string;
  readonly label: string;
  readonly detail?: string;
  readonly icon?: string;
  readonly disabled?: boolean;
}

@Component({
  selector: 'app-select-picker',
  template: `
    <button
      type="button"
      class="picker-trigger"
      [class.compact]="compact()"
      [disabled]="disabled()"
      [attr.aria-expanded]="open()"
      aria-haspopup="dialog"
      (click)="open.set(true)"
    >
      @if (selectedOption()?.icon; as icon) {
        <span class="material-symbols-rounded" aria-hidden="true">{{ icon }}</span>
      }
      <span>{{ selectedOption()?.label ?? placeholder() }}</span>
      <span class="material-symbols-rounded" aria-hidden="true">keyboard_arrow_down</span>
    </button>

    @if (open()) {
      <div class="picker-overlay">
        <button
          class="picker-backdrop"
          type="button"
          aria-label="Close options"
          (click)="open.set(false)"
        ></button>
        <section
          class="picker-sheet"
          role="dialog"
          aria-modal="true"
          [attr.aria-label]="sheetTitle()"
        >
          <header>
            <strong>{{ sheetTitle() }}</strong>
            <button type="button" aria-label="Close options" (click)="open.set(false)">
              <span class="material-symbols-rounded" aria-hidden="true">close</span>
            </button>
          </header>
          <div role="listbox" [attr.aria-label]="sheetTitle()">
            @for (option of options(); track option.value) {
              <button
                type="button"
                class="picker-option"
                [class.selected]="option.value === value()"
                [disabled]="option.disabled"
                role="option"
                [attr.aria-selected]="option.value === value()"
                (click)="select(option.value)"
              >
                @if (option.icon) {
                  <span class="option-icon material-symbols-rounded" aria-hidden="true">{{
                    option.icon
                  }}</span>
                }
                <span class="option-copy">
                  <strong>{{ option.label }}</strong>
                  @if (option.detail) {
                    <small>{{ option.detail }}</small>
                  }
                </span>
                @if (option.value === value()) {
                  <span class="option-check material-symbols-rounded" aria-hidden="true"
                    >check</span
                  >
                }
              </button>
            }
          </div>
        </section>
      </div>
    }
  `,
  styleUrl: './select-picker.scss',
  host: {
    '(document:keydown.escape)': 'open.set(false)',
  },
})
export class SelectPicker {
  readonly value = input('');
  readonly options = input.required<readonly SelectPickerOption[]>();
  readonly sheetTitle = input('Choose an option');
  readonly placeholder = input('Choose an option');
  readonly disabled = input(false);
  readonly compact = input(false);
  readonly valueChange = output<string>();
  readonly open = signal(false);
  readonly selectedOption = computed(() =>
    this.options().find((option) => option.value === this.value()),
  );

  select(value: string): void {
    this.valueChange.emit(value);
    this.open.set(false);
  }
}
