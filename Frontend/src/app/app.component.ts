import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BannerComponent } from './banner/banner.component';
import { SidebarComponent } from './sidebar/sidebar.component';
import { CommonModule } from '@angular/common';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    BannerComponent,
    SidebarComponent,
    CommonModule
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'Frontend';

  constructor(private authService: AuthService) {}

  isLoggedIn(): boolean {
    return this.authService.isLoggedIn();
  }
}
