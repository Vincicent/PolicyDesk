import { registerLocaleData } from '@angular/common';
import localeEnBe from '@angular/common/locales/en-BE';

/** English texts, Belgian formats (1.234,56 € and dd/MM/yyyy). Imported by app.config.ts and by plain functions. */
export const APP_LOCALE = 'en-BE';
registerLocaleData(localeEnBe);
