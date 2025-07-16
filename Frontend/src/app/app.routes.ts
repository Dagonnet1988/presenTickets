/**
 * PresenTickets - Sistema de Gestión de Tickets de Soporte
 * Copyright (c) 2025 Diego Sánchez. Todos los derechos reservados.
 *
 * Este archivo es parte de PresenTickets, un sistema de gestión de tickets
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
 * PresenTickets - Sistema de Gestión de Tickets de Soporte
 * Copyright (c) 2025 Diego Sánchez. Todos los derechos reservados.
 *
 * Este archivo es parte de PresenTickets, un sistema de gestión de tickets
 * desarrollado como iniciativa personal por Diego Sánchez.
 *
 * Uso autorizado únicamente según los términos del acuerdo de licencia.
 * Este software es propiedad intelectual de Diego Sánchez y su uso en
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
import { AuthGuard } from './shared/guards/auth.guard';
import { AdminGuard } from './shared/guards/admin.guard';
import { TechOrAdminGuard } from './shared/guards/tech-or-admin.guard';
import { CreateUserComponent } from './create-user/create-user.component';
import { ManageUsersComponent } from './manage-users/manage-users.component';
import { EditUserComponent } from './edit-user/edit-user.component';
import { LoginGuard } from './shared/guards/login.guard';
import { MainLayoutComponent } from './shared/components/main-layout.component';
import { AboutComponent } from './about/about.component';
import { AdminDashboardComponent } from './admin-dashboard/admin-dashboard.component';
import { PushSettingsComponent } from './push-settings/push-settings.component';
import { DashboardComponent } from './dashboard/dashboard.component';

export const routes: Routes = [
  {
    path: '',
    component: MainLayoutComponent,
    canActivate: [AuthGuard],
    children: [      { path: '', component: HomeComponent, pathMatch: 'full'},
      { path: 'dashboard', component: DashboardComponent, canActivate: [TechOrAdminGuard] },
      { path: 'profile', component: ProfileComponent },
      { path: 'create-ticket', component: CreateTicketComponent },
      { path: 'ticket/:id', component: DetailsTicketComponent },
      { path: 'admin-dashboard', component: AdminDashboardComponent, canActivate: [TechOrAdminGuard] },
      { path: 'create-user', component: CreateUserComponent, canActivate: [AdminGuard] },      { path: 'manage-users', component: ManageUsersComponent, canActivate: [AdminGuard] },
      { path: 'edit-user/:id', component: EditUserComponent, canActivate: [AdminGuard] },
      { path: 'push-settings', component: PushSettingsComponent },
      { path: 'about', component: AboutComponent },
    ]
  },
  { path: 'auth', component: AuthComponent, canActivate: [LoginGuard] },
  { path: '**', redirectTo: '', pathMatch: 'full' },
];

