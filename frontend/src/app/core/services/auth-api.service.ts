import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

// ─── Request / Response interfaces ───────────────────────────────────────────

export interface CheckSetupResponse {
  has_users: boolean;
}

export interface SetupAdminPayload {
  name: string;
  email: string;
  password: string;
}

export interface SetupAdminResponse {
  message: string;
  user: AuthUser;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: AuthUser;
}

export interface RefreshResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: string;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  projects: AuthUserProject[];
  permissions?: Record<string, unknown>;
}

export interface AuthUserProject {
  id: number | string;
  code: string;
  name: string;
  project_type: string;
  status: string;
  access_level: 'view' | 'edit';
  unit_count?: number;
}

export interface ChangePasswordPayload {
  current_password: string;
  new_password: string;
}

// ─── AuthApiService — HTTP-only layer for auth endpoints ─────────────────────

/**
 * AuthApiService — Pure HTTP client สำหรับ auth endpoints
 *
 * รับผิดชอบแค่ HTTP calls — ไม่จัดการ state
 * AuthService ใช้ service นี้ในการเรียก API และจัดการ signal state แยกต่างหาก
 */
@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly http = inject(HttpClient);

  /**
   * ตรวจว่าระบบมี user แล้วหรือยัง
   * GET /api/auth/check-setup (public)
   */
  checkSetup(): Observable<CheckSetupResponse> {
    return this.http.get<CheckSetupResponse>('/api/auth/check-setup');
  }

  /**
   * สร้าง Admin คนแรก — ใช้ได้ครั้งเดียวเมื่อ users table ว่าง
   * POST /api/auth/setup (public)
   */
  setup(payload: SetupAdminPayload): Observable<SetupAdminResponse> {
    return this.http.post<SetupAdminResponse>('/api/auth/setup', payload);
  }

  /**
   * เข้าสู่ระบบ — คืน access_token + user info
   * POST /api/auth/login (public)
   * withCredentials: true เพื่อรับ httpOnly refresh token cookie
   */
  login(payload: LoginPayload): Observable<LoginResponse> {
    return this.http.post<LoginResponse>('/api/auth/login', payload, {
      withCredentials: true,
    });
  }

  /**
   * ต่ออายุ access token โดยใช้ refresh token จาก httpOnly cookie
   * POST /api/auth/refresh (public)
   */
  refresh(): Observable<RefreshResponse> {
    return this.http.post<RefreshResponse>('/api/auth/refresh', {}, {
      withCredentials: true,
    });
  }

  /**
   * ออกจากระบบ — revoke refresh token
   * POST /api/auth/logout (authenticated)
   */
  logout(): Observable<{ message: string }> {
    return this.http.post<{ message: string }>('/api/auth/logout', {}, {
      withCredentials: true,
    });
  }

  /**
   * ดึงข้อมูล user ที่ login อยู่พร้อมรายการโครงการที่มีสิทธิ์
   * GET /api/auth/me (authenticated)
   */
  me(): Observable<AuthUser> {
    return this.http.get<AuthUser>('/api/auth/me');
  }

  /**
   * เปลี่ยนรหัสผ่าน
   * PUT /api/auth/change-password (authenticated)
   */
  changePassword(payload: ChangePasswordPayload): Observable<{ message: string }> {
    return this.http.put<{ message: string }>('/api/auth/change-password', payload);
  }
}
