import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MatListModule } from '@angular/material/list';
import { CommonModule } from '@angular/common';
import { NotificationService, TicketNotification } from '../notification.service';
import { NotificationTypePipe } from '../notification-type.pipe';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [MatListModule, CommonModule, NotificationTypePipe],
  templateUrl: './notifications.component.html',
  styleUrls: ['./notifications.component.css']
})
export class NotificationsComponent implements OnInit {
  public notifications: TicketNotification[] = [];

  constructor(private router: Router, private notificationService: NotificationService) {
    this.notificationService.notifications$.subscribe(n => {
      this.notifications = n;
    });
  }

  ngOnInit(): void {}

  goToTicket(ticketId: number): void {
    this.router.navigate(['/ticket', ticketId]);
  }
}
