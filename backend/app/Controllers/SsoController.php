<?php

namespace App\Controllers;

use App\Services\NaraiSsoService;
use CodeIgniter\HTTP\ResponseInterface;
use RuntimeException;

/**
 * SsoController — HTTP layer สำหรับ Narai Connect OAuth2 SSO
 *
 * Endpoints:
 *   GET  /api/auth/sso/authorize  → redirect ไปยัง Narai Connect login
 *   GET  /api/auth/sso/callback   → รับ callback จาก Narai Connect
 *
 * Security:
 *   - state parameter ตรวจ CSRF (เก็บใน session)
 *   - ห้าม log authorization_code หรือ access_token
 *   - callback สำเร็จ → redirect กลับ frontend พร้อม JWT ใน cookie
 */
class SsoController extends BaseController
{
    private NaraiSsoService $ssoService;

    public function __construct()
    {
        $this->ssoService = new NaraiSsoService();
    }

    // ─── GET /api/auth/sso/authorize ──────────────────────────────────────────

    /**
     * จุดเริ่มต้น SSO — สร้าง state และ redirect ไปยัง Narai Connect
     *
     * 1. สร้าง state random (CSRF token)
     * 2. เก็บ state ใน session
     * 3. Redirect browser ไปยัง Narai Connect authorization URL
     *
     * Response 302: redirect ไป Narai
     * Response 500: { error } ถ้า environment ตั้งค่าไม่ครบ
     */
    public function authorize(): ResponseInterface
    {
        try {
            // สร้าง CSRF state token (32 random bytes = 64 hex chars)
            $state = bin2hex(random_bytes(32));

            // เก็บ state ใน PHP session เพื่อตรวจสอบใน callback
            $session = session();
            $session->set('sso_state', $state);

            $authUrl = $this->ssoService->buildAuthorizationUrl($state);

            return $this->response
                ->setStatusCode(302)
                ->setHeader('Location', $authUrl);

        } catch (RuntimeException $e) {
            $httpCode = in_array($e->getCode(), [500, 503], true) ? $e->getCode() : 500;
            return $this->response->setStatusCode($httpCode)->setJSON(
                ['error' => $e->getMessage()]
            );
        }
    }

    // ─── GET /api/auth/sso/callback ───────────────────────────────────────────

    /**
     * รับ callback จาก Narai Connect หลัง user อนุมัติ
     *
     * Query params:
     *   code  — authorization_code จาก Narai
     *   state — ต้องตรงกับที่เก็บใน session
     *
     * Flow สำเร็จ:
     *   1. ตรวจ state (CSRF)
     *   2. แลก code → token → user info → provision → JWT
     *   3. Redirect ไปยัง frontend /sso-callback?status=success
     *      (access_token อยู่ใน httpOnly cookie ไม่ต้องส่ง URL)
     *
     * Flow ล้มเหลว:
     *   → Redirect ไปยัง frontend /sso-callback?status=error&message=...
     */
    public function callback(): ResponseInterface
    {
        $code  = (string) ($this->request->getGet('code')  ?? '');
        $state = (string) ($this->request->getGet('state') ?? '');
        $error = (string) ($this->request->getGet('error') ?? '');

        $frontendBase = rtrim((string) env('APP_FRONTEND_URL', 'http://localhost:8080'), '/');

        // ── กรณี user ปฏิเสธ (error=access_denied) ────────────────────────
        if ($error !== '') {
            log_message('info', '[SsoController] User denied SSO authorization: ' . $error);
            return $this->redirectToFrontend(
                $frontendBase,
                'error',
                'ยกเลิกการเข้าสู่ระบบด้วย Narai Connect'
            );
        }

        // ── ตรวจ code และ state ────────────────────────────────────────────
        if ($code === '') {
            return $this->redirectToFrontend($frontendBase, 'error', 'ไม่พบ authorization code');
        }

        // ตรวจ CSRF state
        $session      = session();
        $storedState  = (string) ($session->get('sso_state') ?? '');
        $session->remove('sso_state'); // ใช้แล้วลบทิ้งทันที (one-time use)

        if ($storedState === '' || ! hash_equals($storedState, $state)) {
            log_message('warning', '[SsoController] CSRF state mismatch in SSO callback');
            return $this->redirectToFrontend($frontendBase, 'error', 'คำขอไม่ถูกต้อง กรุณาลองใหม่');
        }

        // ── Process SSO callback ────────────────────────────────────────────
        try {
            $result = $this->ssoService->handleCallback(
                $code,
                $this->request->getUserAgent()->getAgentString(),
                $this->request->getIPAddress()
            );

            // Refresh token ถูก set เป็น httpOnly cookie แล้วใน NaraiSsoService
            // ส่ง access_token ผ่าน URL เพื่อให้ frontend เก็บใน memory/localStorage
            // (สั้นพอที่จะส่ง URL — access token อายุ 60 นาที)
            $accessToken = urlencode($result['access_token']);

            return $this->response
                ->setStatusCode(302)
                ->setHeader('Location', $frontendBase . '/sso-callback?status=success&token=' . $accessToken);

        } catch (RuntimeException $e) {
            $httpCode = $e->getCode();
            $message  = $e->getMessage();

            if ($httpCode === 403) {
                // บัญชีถูกระงับ — บอก user ชัดเจน
                return $this->redirectToFrontend($frontendBase, 'forbidden', $message);
            }

            log_message('error', '[SsoController] SSO callback error: ' . $message);
            return $this->redirectToFrontend($frontendBase, 'error', 'เกิดข้อผิดพลาด กรุณาลองใหม่');
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helper
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Redirect ไปยัง frontend /sso-callback พร้อม status และ message
     */
    private function redirectToFrontend(string $base, string $status, string $message): ResponseInterface
    {
        $params = http_build_query(['status' => $status, 'message' => $message]);
        return $this->response
            ->setStatusCode(302)
            ->setHeader('Location', $base . '/sso-callback?' . $params);
    }
}
