import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { importProvidersFrom } from '@angular/core';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { routes } from './app.routes';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { CustomPaginatorIntl } from './custom-paginator-intl';

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: MatPaginatorIntl, useClass: CustomPaginatorIntl },
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideClientHydration(withEventReplay()),
    importProvidersFrom(
      BrowserAnimationsModule
    ),
    provideHttpClient(withFetch())
  ]
};
