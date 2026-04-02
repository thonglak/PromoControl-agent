import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';

import { AuthService } from '../../core/services/auth.service';

function passwordComplexity(ctrl: AbstractControl): ValidationErrors | null {
  const val: string = ctrl.value ?? '';
  if (!val) return null;
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(val) ? null : { complexity: true };
}

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const pw  = group.get('new_password')?.value;
  const cpw = group.get('confirm_password')?.value;
  return pw && cpw && pw !== cpw ? { mismatch: true } : null;
}

@Component({
  selector: 'app-change-password-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule, MatButtonModule, MatDialogModule,
    MatFormFieldModule, MatInputModule, MatProgressSpinnerModule,
  ],
  templateUrl: './change-password-dialog.component.html',
})
export class ChangePasswordDialogComponent {
  private readonly fb         = inject(FormBuilder);
  private readonly dialogRef  = inject(MatDialogRef<ChangePasswordDialogComponent>);
  private readonly http       = inject(HttpClient);
  private readonly auth       = inject(AuthService);
  private readonly snackBar   = inject(MatSnackBar);

  saving         = signal(false);
  showCurrent    = signal(false);
  showNew        = signal(false);
  showConfirm    = signal(false);

  form = this.fb.group({
    old_password: ['', Validators.required],
    new_password:     ['', [Validators.required, passwordComplexity]],
    confirm_password: ['', Validators.required],
  }, { validators: passwordsMatch });

  get newPwErrors(): string | null {
    const ctrl = this.form.get('new_password')!;
    if (!ctrl.touched || !ctrl.errors) return null;
    if (ctrl.errors['required']) return 'กรุณากรอกรหัสผ่านใหม่';
    if (ctrl.errors['complexity']) return 'รหัสผ่านต้องมีอย่างน้อย 8 ตัว มีตัวพิมพ์ใหญ่ พิมพ์เล็ก และตัวเลข';
    return null;
  }

  get confirmErrors(): string | null {
    const ctrl = this.form.get('confirm_password')!;
    if (!ctrl.touched) return null;
    if (ctrl.errors?.['required']) return 'กรุณายืนยันรหัสผ่าน';
    if (this.form.errors?.['mismatch']) return 'รหัสผ่านไม่ตรงกัน';
    return null;
  }

  save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);

    const { old_password, new_password } = this.form.value;
    this.http.put('/api/auth/change-password', { old_password, new_password }).subscribe({
      next: () => {
        this.snackBar.open('เปลี่ยนรหัสผ่านสำเร็จ', 'ปิด', { duration: 3000 });
        this.dialogRef.close(true);
      },
      error: (err) => {
        this.saving.set(false);
        const msg = err?.error?.message ?? 'รหัสผ่านปัจจุบันไม่ถูกต้อง';
        this.snackBar.open(msg, 'ปิด', { duration: 4000 });
      },
    });
  }

  cancel(): void { this.dialogRef.close(false); }
}
