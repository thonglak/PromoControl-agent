import { bootstrapApplication } from '@angular/platform-browser';
import { registerLocaleData } from '@angular/common';
import localeTh from '@angular/common/locales/th';

import { appConfig } from './app/app.config';
import { App } from './app/app';

// ลงทะเบียน locale ภาษาไทย
registerLocaleData(localeTh, 'th-u-ca-gregory');

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
