import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { SelectOnFocusService } from './core/services/select-on-focus.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.html',
})
export class App {
  // trigger instantiation — service hook document focus listener ใน constructor
  private readonly _selectOnFocus = inject(SelectOnFocusService);
}
