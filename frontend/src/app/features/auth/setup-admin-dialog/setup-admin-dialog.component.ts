import { Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';

import { AuthService } from '../../../core/services/auth.service';
import { SvgIconComponent } from '../../../shared/components/svg-icon/svg-icon.component';

/** Validator ตรวจว่า password กับ confirmPassword ตรงกัน */
const passwordsMatchValidator: ValidatorFn = (group: AbstractControl): ValidationErrors | null => {
  const pw = group.get('password')?.value as string;
  const confirm = group.get('confirmPassword')?.value as string;
  return pw && confirm && pw !== confirm ? { passwordsMismatch: true } : null;
};

@Component({
  selector: 'app-setup-admin-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    SvgIconComponent,
  ],
  templateUrl: './setup-admin-dialog.component.html',
})
export class SetupAdminDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly dialogRef = inject(MatDialogRef<SetupAdminDialogComponent>);
  private readonly snackBar = inject(MatSnackBar);

  readonly loading = signal(false);
  readonly showPassword = signal(false);

  readonly form = this.fb.group(
    {
      name: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', Validators.required],
    },
    { validators: passwordsMatchValidator },
  );

  onSubmit(): void {
    if (this.form.invalid || this.loading()) return;
    this.loading.set(true);

    const { name, email, password } = this.form.getRawValue();

    this.auth.setup({ name: name!, email: email!, password: password! }).subscribe({
      next: () => {
        // auto-login ทันทีด้วยข้อมูลที่เพิ่งสร้าง
        this.auth.login(email!, password!).subscribe({
          next: () => {
            this.loading.set(false);
            this.snackBar.open('สร้างผู้ดูแลระบบสำเร็จ', 'ปิด', { duration: 3000 });
            this.dialogRef.close(true);
            this.router.navigate(['/select-project']);
          },
          error: () => {
            // สร้างสำเร็จแต่ login ไม่ได้ — ให้ user login เอง
            this.loading.set(false);
            this.snackBar.open('สร้างสำเร็จ กรุณาเข้าสู่ระบบ', 'ปิด', { duration: 4000 });
            this.dialogRef.close(true);
          },
        });
      },
      error: (err: { error?: { error?: string } }) => {
        this.loading.set(false);
        const msg = err?.error?.error ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่';
        this.snackBar.open(msg, 'ปิด', { duration: 4000 });
      },
    });
  }

  onCancel(): void {
    this.dialogRef.close(false);
  }
}
