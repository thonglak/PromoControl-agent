import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';

import { AuthService } from '../../../core/services/auth.service';
import { SetupAdminDialogComponent } from '../setup-admin-dialog/setup-admin-dialog.component';
import { SvgIconComponent } from '../../../shared/components/svg-icon/svg-icon.component';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatDividerModule,
    SvgIconComponent,
  ],
  templateUrl: './login-page.component.html',
})
export class LoginPageComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  readonly loading = signal(false);
  readonly showPassword = signal(false);
  readonly needsSetup = signal(false);

  readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  ngOnInit(): void {
    this.auth.checkSetup().subscribe({
      next: res => this.needsSetup.set(!res.has_users),
      error: () => this.needsSetup.set(false),
    });
  }

  onLogin(): void {
    if (this.form.invalid || this.loading()) return;
    this.loading.set(true);
    const { email, password } = this.form.getRawValue();

    this.auth.login(email!, password!).subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigate(['/select-project']);
      },
      error: (err: { error?: { error?: string } }) => {
        this.loading.set(false);
        const msg = err?.error?.error ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่';
        this.snackBar.open(msg, 'ปิด', { duration: 4000 });
      },
    });
  }

  openSetupDialog(): void {
    const ref = this.dialog.open(SetupAdminDialogComponent, {
      width: '480px',
      maxHeight: '90vh',
      disableClose: true,
    });
    ref.afterClosed().subscribe((success: boolean) => {
      if (success) this.needsSetup.set(false);
    });
  }

  /** เริ่ม SSO flow — redirect ไปยัง Narai Connect ผ่าน backend */
  loginWithNarai(): void {
    // ใช้ full redirect (ไม่ใช่ HttpClient) เพราะต้องส่ง browser ไป Narai
    window.location.href = '/api/auth/sso/authorize';
  }
}
