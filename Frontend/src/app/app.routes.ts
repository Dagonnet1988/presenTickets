/**
 * PresentiTickets - Sistema de Gestión de Tickets de Soporte
 * Copyright (c) 2023-2025 Diego Sánchez. Todos los derechos reservados.
 *
 * Este archivo es parte de PresentiTickets, un sistema de gestión de tickets
 * desarrollado como iniciativa personal por Diego Sánchez.
 *
 * Uso autorizado únicamente según los términos del acuerdo de licencia.
 * Este software es propiedad intelectual de Diego Sánchez y su uso en
 * Clínica La Presentación está regido por un acuerdo de licencia no exclusiva.
 *
 * Está prohibida la redistribución, modificación o uso no autorizado
 * de este código sin el consentimiento expreso por escrito del autor.
 */

/**
 * PresentiTickets - Sistema de Gestión de Tickets de Soporte
 * Copyright (c) 2023-2025 Diego Narváez. Todos los derechos reservados.
 *
 * Este archivo es parte de PresentiTickets, un sistema de gestión de tickets
 * desarrollado como iniciativa personal por Diego Narváez.
 *
 * Uso autorizado únicamente según los términos del acuerdo de licencia.
 * Este software es propiedad intelectual de Diego Narváez y su uso en
 * Clínica La Presentación está regido por un acuerdo de licencia no exclusiva.
 *
 * Está prohibida la redistribución, modificación o uso no autorizado
 * de este código sin el consentimiento expreso por escrito del autor.
 */

import { Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { AuthComponent } from './auth/auth.component';
import { ProfileComponent } from './profile/profile.component';
import { CreateTicketComponent } from './create-ticket/create-ticket.component';
import { DetailsTicketComponent } from './details-ticket/details-ticket.component';
import { AuthGuard } from './auth.guard';
import { CreateUserComponent } from './create-user/create-user.component';
import { ManageUsersComponent } from './manage-users/manage-users.component';
import { EditUserComponent } from './edit-user/edit-user.component';
import { LoginGuard } from './login.guard';
import { MainLayoutComponent } from './main-layout.component';
import { AboutComponent } from './about.component';

export const routes: Routes = [
  {
    path: '',
    component: MainLayoutComponent,
    canActivate: [AuthGuard],
    children: [
      { path: '', component: HomeComponent, pathMatch: 'full'},
      { path: 'profile', component: ProfileComponent },
      { path: 'create-ticket', component: CreateTicketComponent },
      { path: 'ticket/:id', component: DetailsTicketComponent },
      { path: 'create-user', component: CreateUserComponent },
      { path: 'manage-users', component: ManageUsersComponent },
      { path: 'edit-user/:id', component: EditUserComponent },
      { path: 'about', component: AboutComponent },
    ]
  },
  { path: 'auth', component: AuthComponent, canActivate: [LoginGuard] },
  { path: '**', redirectTo: '', pathMatch: 'full' },
];

