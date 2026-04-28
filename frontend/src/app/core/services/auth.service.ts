import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, of, firstValueFrom, tap, switchMap, catchError } from 'rxjs';
import { ProjectService } from './project.service';

export interface UserProject {
  id: number | string;
  code: string;
  name: string;
  project_type: string;
  status: string;
  access_level: 'view' | 'edit';
}

export interface User {
  id: number;
  email: string;
  name: string;
  role: string;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  projects: UserProject[];
  permissions?: Record<string, unknown>;
}

interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

interface RefreshResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

const TOKEN_KEY = 'access_token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http   = inject(HttpClient);
  private readonly router   = inject(Router);
  private readonly projectSvc = inject(ProjectService);

  /** JWT access token — เก็บใน memory + localStorage */
  readonly accessToken = signal<string | null>(null);

  /** ข้อมูล user ที่ login อยู่ */
  readonly currentUser = signal<User | null>(null);

  /** computed: true ถ้า login อยู่ */
  readonly isAuthenticated = computed(() => this.currentUser() !== null);

  // ──────────────────────────────────────────────────────────────

  checkSetup(): Observable<{ has_users: boolean }> {
    return this.http.get<{ has_users: boolean }>('/api/auth/check-setup');
  }

  setup(data: { email: string; password: string; name: string }): Observable<unknown> {
    return this.http.post('/api/auth/setup', data);
  }

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>('/api/auth/login', { email, password }, { withCredentials: true })
      .pipe(
        tap(res => {
          localStorage.setItem(TOKEN_KEY, res.access_token);
          this.accessToken.set(res.access_token);
          this.currentUser.set(res.user);
        }),
      );
  }

  /**
   * handleSsoToken — เรียกหลังจาก SSO callback redirect กลับมา
   *
   * Backend ส่ง access_token มาใน URL query param (เพราะ httpOnly cookie
   * รับ refresh token ไว้แล้ว) ฟังก์ชันนี้:
   * 1. เก็บ access_token ใน memory + localStorage
   * 2. ดึง user info ด้วย /api/auth/me เพื่อ populate currentUser signal
   *
   * @param token  access_token จาก query param ?token=...
   */
  handleSsoToken(token: string): Promise<void> {
    localStorage.setItem(TOKEN_KEY, token);
    this.accessToken.set(token);

    return firstValueFrom(
      this.me().pipe(
        catchError(() => {
          this.clearSession();
          return of(null);
        }),
      ),
    ).then(() => {});
  }

  refresh(): Observable<RefreshResponse> {
    return this.http
      .post<RefreshResponse>('/api/auth/refresh', {}, { withCredentials: true })
      .pipe(
        tap(res => {
          localStorage.setItem(TOKEN_KEY, res.access_token);
          this.accessToken.set(res.access_token);
        }),
      );
  }

  logout(): Observable<unknown> {
    return this.http.post('/api/auth/logout', {}, { withCredentials: true }).pipe(
      tap(() => this.clearSession()),
    );
  }

  me(): Observable<User> {
    return this.http
      .get<User>('/api/auth/me')
      .pipe(tap(user => this.currentUser.set(user)));
  }

  /**
   * initSession — เรียกจาก APP_INITIALIZER ก่อน routing เริ่ม
   * 1. อ่าน token จาก localStorage
   * 2. ถ้ามี → call /me เพื่อ validate + restore currentUser
   * 3. ถ้า /me ล้มเหลว (expired) → ลอง refresh แล้ว call /me ใหม่
   * 4. ถ้า refresh ล้มเหลวด้วย → clearSession (ไม่ redirect ที่นี่ guard จัดการ)
   */
  initSession(): Promise<void> {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return Promise.resolve();

    this.accessToken.set(token);

    return firstValueFrom(
      this.me().pipe(
        catchError(() =>
          this.refresh().pipe(
            switchMap(() => this.me()),
            catchError(() => {
              this.clearSession();
              return of(null);
            }),
          ),
        ),
      ),
    ).then(() => {});
  }

  /** ล้าง session state (ใช้ใน interceptor เมื่อ refresh ล้มเหลว) */
  clearSession(): void {
    localStorage.removeItem(TOKEN_KEY);
    this.projectSvc.clearProject();
    this.accessToken.set(null);
    this.currentUser.set(null);
    this.router.navigate(['/login']);
  }
}
