import { Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { AuthComponent } from './auth/auth.component';
import { ProfileComponent } from './profile/profile.component';
import { CreateTicketComponent } from './create-ticket/create-ticket.component';
import { DetailsTicketComponent } from './details-ticket/details-ticket.component';
import { AuthGuard } from './auth.guard';
import { PruebaComponent } from './prueba/prueba.component';
import { CreateUserComponent } from './create-user/create-user.component';
import { ManageUsersComponent } from './manage-users/manage-users.component';
import { EditUserComponent } from './edit-user/edit-user.component';

export const routes: Routes = [
  { path: '', component: HomeComponent, canActivate: [AuthGuard] },
  { path: 'auth', component: AuthComponent },
  { path: 'profile', component: ProfileComponent, canActivate: [AuthGuard] },
  { path: 'create-ticket', component: CreateTicketComponent, canActivate: [AuthGuard] },
  { path: 'ticket/:id', component: DetailsTicketComponent, canActivate: [AuthGuard] },
  { path: 'create-user', component: CreateUserComponent, canActivate: [AuthGuard] },
  { path: 'manage-users', component: ManageUsersComponent, canActivate: [AuthGuard] },
  { path: 'prueba', component: PruebaComponent, canActivate: [AuthGuard] },
  { path: 'edit-user/:id', component: EditUserComponent },
];

