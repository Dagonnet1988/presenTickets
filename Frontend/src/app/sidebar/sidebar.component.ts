import { Component, OnInit, ViewChild } from '@angular/core';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../auth.service';
import { CommonModule } from '@angular/common';
import { HomeComponent } from '../home/home.component';
import { RefreshTicketsService } from '../refresh-tickets.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatSidenavModule,
    MatToolbarModule,
    RouterModule,
  ],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.css']
})
export class SidebarComponent implements OnInit {
  userRole: string = '';
  isCollapsed: boolean = false;
  @ViewChild(HomeComponent) homeComponent?: HomeComponent;

  constructor(private authService: AuthService, private router: Router, private refreshTicketsService: RefreshTicketsService) {}

  ngOnInit(): void {
    this.userRole = this.authService.getUserRole() || '';
  }

  toggleSidebar(): void {
    this.isCollapsed = !this.isCollapsed;
  }

  goToHomeAndRefresh() {
    this.router.navigate(['/']).then(() => {
      this.refreshTicketsService.triggerRefresh();
    });
  }
}

