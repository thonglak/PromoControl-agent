import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, FormArray, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';

import { UserService, UserListItem, AllProject, ProjectAssignment } from '../user.service';

export interface AssignProjectsDialogData {
  user: UserListItem;
  allProjects: AllProject[];
}

@Component({
  selector: 'app-assign-projects-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule, MatButtonModule, MatDialogModule,
    MatCheckboxModule, MatSelectModule, MatFormFieldModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './assign-projects-dialog.component.html',
})
export class AssignProjectsDialogComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<AssignProjectsDialogComponent>);
  readonly data: AssignProjectsDialogData = inject(MAT_DIALOG_DATA);
  private readonly userService = inject(UserService);
  private readonly snackBar = inject(MatSnackBar);

  saving = signal(false);

  form = this.fb.group({
    assignments: this.fb.array<FormGroup>([]),
  });

  get assignments(): FormArray { return this.form.get('assignments') as FormArray; }

  ngOnInit(): void {
    const existingMap = new Map<number, 'view' | 'edit'>(
      this.data.user.projects.map(p => [p.id, p.access_level])
    );

    this.data.allProjects.forEach(project => {
      const isAssigned = existingMap.has(project.id);
      const accessLevel = existingMap.get(project.id) ?? 'view';
      this.assignments.push(
        this.fb.group({
          project_id:   [project.id],
          project_name: [project.name],
          project_code: [project.code],
          checked:      [isAssigned],
          access_level: [accessLevel],
        })
      );
    });
  }

  save(): void {
    if (this.saving()) return;
    this.saving.set(true);

    const projects: ProjectAssignment[] = this.assignments.controls
      .filter(ctrl => ctrl.get('checked')!.value === true)
      .map(ctrl => ({
        project_id:   ctrl.get('project_id')!.value as number,
        access_level: ctrl.get('access_level')!.value as 'view' | 'edit',
      }));

    this.userService.assignProjects(this.data.user.id, projects).subscribe({
      next: () => {
        this.snackBar.open('กำหนดโครงการสำเร็จ', 'ปิด', { duration: 3000 });
        this.dialogRef.close(true);
      },
      error: (err) => {
        this.saving.set(false);
        const msg = err?.error?.message ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่';
        this.snackBar.open(msg, 'ปิด', { duration: 4000 });
      },
    });
  }

  cancel(): void {
    this.dialogRef.close(false);
  }
}
