import { Routes } from '@angular/router';
import { NumberSeriesListComponent } from './pages/number-series-list.component';
import { DateFormatSettingsComponent } from './pages/date-format-settings.component';

export const SETTINGS_ROUTES: Routes = [
  { path: 'number-series', component: NumberSeriesListComponent },
  { path: 'date-format', component: DateFormatSettingsComponent },
  { path: '', redirectTo: 'number-series', pathMatch: 'full' },
];
