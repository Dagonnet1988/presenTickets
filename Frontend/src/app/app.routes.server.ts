import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    path: 'ticket/:id',
    renderMode: RenderMode.Server // Renderiza dinámicamente en el servidor
  },
  {
    path: 'edit-user/:id',
    renderMode: RenderMode.Server // Renderiza dinámicamente en el servidor
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender // Prerenderiza todas las demás rutas
  }
];
