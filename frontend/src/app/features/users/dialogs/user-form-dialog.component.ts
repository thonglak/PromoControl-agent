import { Component, inject, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';

import { UserService, UserListItem, UserRole, CreateUserDto, UpdateUserDto } from '../user.service';

export interface UserFormDialogData {
  mode: 'create' | 'edit';
  user?: UserListItem;
}

/** Validator: password complexity (uppercase + lowercase + digit, min 8 chars) */
function passwordComplexity(control: AbstractControl): ValidationErrors | null {
  const val: string = control.value ?? '';
  if (!val) return null;
  const ok = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(val);
  return ok ? null : { complexity: true };
}

@Component({
  selector: 'app-user-form-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule, MatButtonModule, MatDialogModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatSlideToggleModule, MatProgressSpinnerModule,
  ],
  templateUrl: './user-form-dialog.component.html',
})
export class UserFormDialogComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<UserFormDialogComponent>);
  readonly data: UserFormDialogData = inject(MAT_DIALOG_DATA);
  private readonly userService = inject(UserService);
  private readonly snackBar = inject(MatSnackBar);

  saving = false;
  showPassword = false;

  readonly roles = [
    { value: 'admin',   label: 'ผู้ดูแลระบบ (Admin)' },
    { value: 'manager', label: 'ผู้จัดการ (Manager)' },
    { value: 'sales',   label: 'พนักงานขาย (Sales)' },
    { value: 'finance', label: 'การเงิน (Finance)' },
    { value: 'viewer',  label: 'ผู้ดู (Viewer)' },
  ];

  form = this.fb.group({
    name:      ['', Validators.required],
    email:     ['', [Validators.required, Validators.email]],
    password:  ['', []],
    role:      ['sales' as UserRole, Validators.required],
    phone:     [''],
    is_active: [true],
  });

  ngOnInit(): void {
    if (this.isEdit) {
      const u = this.data.user!;
      this.form.patchValue({
        name:      u.name,
        email:     u.email,
        role:      u.role,
        phone:     u.phone ?? '',
        is_active: u.is_active,
      });
      this.form.get('email')!.disable();
      // Password optional on edit
      this.form.get('password')!.clearValidators();
      this.form.get('password')!.addValidators([passwordComplexity]);
    } else {
      // Password required on create
      this.form.get('password')!.addValidators([Validators.required, passwordComplexity]);
    }
    this.form.get('password')!.updateValueAndValidity();
  }

  get isEdit(): boolean { return this.data.mode === 'edit'; }
  get title(): string { return this.isEdit ? 'แก้ไขข้อมูลผู้ใช้' : 'เพิ่มผู้ใช้งาน'; }

  get passwordErrors(): string | null {
    const ctrl = this.form.get('password')!;
    if (!ctrl.touched || !ctrl.errors) return null;
    if (ctrl.errors['required']) return 'กรุณากรอกรหัสผ่าน';
    if (ctrl.errors['complexity']) return 'รหัสผ่านต้องมีอย่างน้อย 8 ตัว มีตัวพิมพ์ใหญ่ พิมพ์เล็ก และตัวเลข';
    return null;
  }

  save(): void {
    if (this.form.invalid || this.saving) return;
    this.saving = true;

    const v = this.form.getRawValue();

    if (this.isEdit) {
      const dto: UpdateUserDto = {
        name:      v.name!,
        role:      v.role as UserRole,
        phone:     v.phone || null,
        is_active: v.is_active!,
      };
      this.userService.updateUser(this.data.user!.id, dto).subscribe({
        next: () => {
          this.snackBar.open('บันทึกข้อมูลสำเร็จ', 'ปิด', { duration: 3000 });
          this.dialogRef.close(true);
        },
        error: (err) => {
          this.saving = false;
          const msg = err?.error?.message ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่';
          this.snackBar.open(msg, 'ปิด', { duration: 4000 });
        },
      });
    } else {
      const dto: CreateUserDto = {
        email:    v.email!,
        password: v.password!,
        name:     v.name!,
        role:     v.role as UserRole,
        phone:    v.phone || undefined,
      };
      this.userService.createUser(dto).subscribe({
        next: () => {
          this.snackBar.open('สร้างผู้ใช้งานสำเร็จ', 'ปิด', { duration: 3000 });
          this.dialogRef.close(true);
        },
        error: (err) => {
          this.saving = false;
          const msg = err?.error?.message ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่';
          this.snackBar.open(msg, 'ปิด', { duration: 4000 });
        },
      });
    }
  }

  cancel(): void {
    this.dialogRef.close(false);
  }
}
