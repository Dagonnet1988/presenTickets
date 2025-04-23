import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MatListModule } from '@angular/material/list';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [MatListModule,
    CommonModule

  ],
  templateUrl: './notifications.component.html',
  styleUrls: ['./notifications.component.css']
})
export class NotificationsComponent implements OnInit {
  public notifications: any[] = [];

  constructor(private router: Router) {
    const navigation = this.router.getCurrentNavigation();
    if (navigation?.extras?.state) {
      this.notifications = navigation.extras.state['notifications'] || [];
    }
  }

  ngOnInit(): void {}

  goToTicket(ticketId: number): void {
    this.router.navigate(['/ticket', ticketId]);
  }
}
