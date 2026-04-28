import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { BehaviorSubject, Observable, catchError, filter, switchMap, take, throwError } from 'rxjs';

import { AuthService } from '../services/auth.service';

/** Public endpoints — ไม่ต้องแนบ token และไม่ต้อง refresh เมื่อ 401 */
const PUBLIC_PATHS = [
  '/api/auth/check-setup',
  '/api/auth/setup',
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/auth/sso/authorize',
  '/api/auth/sso/callback',
];

// ─── Module-level refresh state ───────────────────────────────────────────
// ใช้เพื่อ queue concurrent 401 requests ระหว่าง refresh — ห้าม fire ซ้ำ
let isRefreshing = false;
const refreshSubject = new BehaviorSubject<string | null>(null);

/** เพิ่ม Authorization header */
function withToken(req: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

/** รอ token ใหม่จาก refreshSubject แล้ว retry request (สำหรับ queued requests) */
function waitAndRetry(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> {
  return refreshSubject.pipe(
    filter((token): token is string => token !== null),
    take(1),
    switchMap(token => next(withToken(req, token))),
  );
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  const isPublic = PUBLIC_PATHS.some(p => req.url.includes(p));
  const token = auth.accessToken();

  // แนบ token สำหรับ protected endpoints
  const authReq = token && !isPublic ? withToken(req, token) : req;

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      // ไม่ใช่ 401 หรือเป็น public endpoint → ส่งต่อ error เลย
      if (error.status !== 401 || isPublic) {
        return throwError(() => error);
      }

      // ─── 401 บน protected endpoint ─────────────────────────────────────

      if (isRefreshing) {
        // Refresh กำลังทำงานอยู่ → queue request นี้รอ token ใหม่
        return waitAndRetry(req, next);
      }

      // ─── เริ่ม refresh (คนแรกที่เจอ 401) ───────────────────────────────
      isRefreshing = true;
      refreshSubject.next(null); // บอกให้ queued requests รอ

      return auth.refresh().pipe(
        switchMap(() => {
          // auth.refresh() ใช้ tap() update signal แล้ว — อ่านจาก signal
          isRefreshing = false;
          const newToken = auth.accessToken()!;
          refreshSubject.next(newToken); // unblock queued requests
          return next(withToken(req, newToken));
        }),
        catchError(refreshErr => {
          isRefreshing = false;
          refreshSubject.next(null);
          // refresh ล้มเหลว → ล้าง session + redirect /login
          auth.clearSession();
          return throwError(() => refreshErr);
        }),
      );
    }),
  );
};
