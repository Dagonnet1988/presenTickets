import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { UserService } from '../user.service';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ]
})
export class ProfileComponent implements OnInit {
  user: any;
  isEditing: boolean = false;
  userID: string = '';

  constructor(private userService: UserService, private authService: AuthService) {}

  ngOnInit(): void {
    this.userID = this.authService.getUserId() || '';
    this.getUserData();
  }

  getUserData(): void {
    this.userService.getUser(this.userID).subscribe(data => {
      this.user = data;
    });
  }

  toggleEdit(): void {
    if (this.isEditing) {
      // Guardar cambios
      this.userService.updateUser(this.userID, this.user).subscribe(response => {
        console.log('User updated successfully');
      });
    }
    this.isEditing = !this.isEditing;
  }
}
