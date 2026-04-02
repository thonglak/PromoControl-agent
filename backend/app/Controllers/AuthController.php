<?php

namespace App\Controllers;

use App\Services\AuthService;
use CodeIgniter\HTTP\ResponseInterface;
use RuntimeException;

/**
 * AuthController — HTTP layer สำหรับ Authentication
 *
 * กฎ:
 * - Controller จัดการเฉพาะ HTTP (request parsing, validation ระดับ field, response format)
 * - Business logic ทั้งหมดอยู่ใน AuthService
 * - ห้าม return password_hash หรือ token_hash
 * - refresh_token ส่งผ่าน httpOnly cookie เท่านั้น
 */
class AuthController extends BaseController
{
    private AuthService $authService;

    public function __construct()
    {
        $this->authService = new AuthService();
    }

    // ─── GET /api/auth/check-setup ─────────────────────────────────────

    /**
     * ตรวจว่ามี user ในระบบหรือยัง
     * Response: { "has_users": bool }
     */
    public function checkSetup(): ResponseInterface
    {
        return $this->response
            ->setStatusCode(200)
            ->setJSON(['has_users' => ! $this->authService->checkSetup()]);
    }

    // ─── POST /api/auth/setup ──────────────────────────────────────────

    /**
     * สร้าง admin คนแรก (ใช้ได้ครั้งเดียวเมื่อ users table ว่าง)
     *
     * Request: { email, password, name }
     * Response 201: { message, user }
     * Response 400: { error } ถ้ามี user แล้ว
     * Response 422: { error } ถ้า input ไม่ครบ / รูปแบบ email ผิด
     */
    public function setup(): ResponseInterface
    {
        $body = $this->request->getJSON(true) ?? [];

        $email    = trim((string) ($body['email']    ?? ''));
        $password =       (string) ($body['password'] ?? '');
        $name     = trim((string) ($body['name']     ?? ''));

        // Validate required fields
        $missing = [];
        if ($email === '')    { $missing[] = 'email'; }
        if ($password === '') { $missing[] = 'password'; }
        if ($name === '')     { $missing[] = 'ชื่อ'; }

        if (! empty($missing)) {
            return $this->response->setStatusCode(422)->setJSON(
                ['error' => 'กรุณากรอก ' . implode(', ', $missing)]
            );
        }

        if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return $this->response->setStatusCode(422)->setJSON(
                ['error' => 'รูปแบบ email ไม่ถูกต้อง']
            );
        }

        try {
            $user = $this->authService->setup($email, $password, $name);
            return $this->response->setStatusCode(201)->setJSON([
                'message' => 'สร้างผู้ดูแลระบบสำเร็จ',
                'user'    => $user,
            ]);
        } catch (RuntimeException $e) {
            // service throws 403 ถ้ามี user แล้ว, 400 ถ้า password ไม่ผ่าน rules
            $serviceCode = $e->getCode();
            $httpCode    = in_array($serviceCode, [400, 403, 422], true) ? $serviceCode : 400;
            return $this->response->setStatusCode($httpCode)->setJSON(
                ['error' => $e->getMessage()]
            );
        }
    }

    // ─── POST /api/auth/login ──────────────────────────────────────────

    /**
     * Login ด้วย email + password
     *
     * Request: { email, password }
     * Response 200: { access_token, token_type, expires_in, user }
     * Response 401: { error } อีเมล/รหัสผ่านไม่ถูกต้อง
     * Response 423: { error } บัญชีถูกล็อค
     */
    public function login(): ResponseInterface
    {
        $body = $this->request->getJSON(true) ?? [];

        $email    = trim((string) ($body['email']    ?? ''));
        $password =       (string) ($body['password'] ?? '');

        if ($email === '' || $password === '') {
            return $this->response->setStatusCode(422)->setJSON(
                ['error' => 'กรุณากรอก email และ password']
            );
        }

        try {
            $result = $this->authService->login(
                $email,
                $password,
                $this->request->getUserAgent()->getAgentString(),
                $this->request->getIPAddress()
            );
            return $this->response->setStatusCode(200)->setJSON($result);
        } catch (RuntimeException $e) {
            $serviceCode = $e->getCode();

            // service โยน 429 สำหรับบัญชีถูกล็อค → map เป็น 423 (Locked) ตาม API spec
            if ($serviceCode === 429) {
                return $this->response->setStatusCode(423)->setJSON(
                    ['error' => $e->getMessage()]
                );
            }

            $httpCode = in_array($serviceCode, [401, 403], true) ? $serviceCode : 401;
            return $this->response->setStatusCode($httpCode)->setJSON(
                ['error' => $e->getMessage()]
            );
        }
    }

    // ─── POST /api/auth/refresh ────────────────────────────────────────

    /**
     * ออก access token ใหม่จาก refresh token ใน httpOnly cookie
     *
     * Response 200: { access_token, token_type, expires_in }
     * Response 401: { error } ถ้าไม่มี / invalid cookie
     */
    public function refresh(): ResponseInterface
    {
        $rawToken = (string) ($this->request->getCookie('refresh_token') ?? '');

        if ($rawToken === '') {
            return $this->response->setStatusCode(401)->setJSON(
                ['error' => 'ไม่พบ refresh token กรุณาเข้าสู่ระบบใหม่']
            );
        }

        try {
            $result = $this->authService->refresh(
                $rawToken,
                $this->request->getUserAgent()->getAgentString(),
                $this->request->getIPAddress()
            );
            return $this->response->setStatusCode(200)->setJSON($result);
        } catch (RuntimeException $e) {
            $httpCode = in_array($e->getCode(), [401, 403], true) ? $e->getCode() : 401;
            return $this->response->setStatusCode($httpCode)->setJSON(
                ['error' => $e->getMessage()]
            );
        }
    }

    // ─── POST /api/auth/logout ─────────────────────────────────────────

    /**
     * Logout: revoke refresh token + clear cookie
     * (ต้องผ่าน jwt_auth filter — มี valid access token)
     *
     * Response 200: { message }
     */
    public function logout(): ResponseInterface
    {
        $rawToken = (string) ($this->request->getCookie('refresh_token') ?? '');
        $this->authService->logout($rawToken);

        return $this->response->setStatusCode(200)->setJSON(
            ['message' => 'ออกจากระบบสำเร็จ']
        );
    }

    // ─── GET /api/auth/me ──────────────────────────────────────────────

    /**
     * ดึงข้อมูล user ปัจจุบัน + projects + permissions
     * (ต้องผ่าน jwt_auth filter — user_id มาจาก filter attribute)
     *
     * Response 200: { id, email, name, role, phone, avatar_url, is_active, projects, permissions }
     */
    public function me(): ResponseInterface
    {
        $userId = (int) ($this->request->user_id ?? 0);

        try {
            $user = $this->authService->me($userId);
            return $this->response->setStatusCode(200)->setJSON($user);
        } catch (RuntimeException $e) {
            $httpCode = in_array($e->getCode(), [401, 403, 404], true) ? $e->getCode() : 404;
            return $this->response->setStatusCode($httpCode)->setJSON(
                ['error' => $e->getMessage()]
            );
        }
    }

    // ─── PUT /api/auth/change-password ────────────────────────────────

    /**
     * เปลี่ยนรหัสผ่าน — revoke ทุก refresh token (force re-login ทุก device)
     * (ต้องผ่าน jwt_auth filter)
     *
     * Request: { old_password, new_password }
     * Response 200: { message }
     * Response 400: { error } รหัสผ่านเดิมผิด / ไม่ตรงตาม rules
     */
    public function changePassword(): ResponseInterface
    {
        $userId = (int) ($this->request->user_id ?? 0);
        $body   = $this->request->getJSON(true) ?? [];

        $oldPassword = (string) ($body['old_password'] ?? '');
        $newPassword = (string) ($body['new_password'] ?? '');

        if ($oldPassword === '' || $newPassword === '') {
            return $this->response->setStatusCode(422)->setJSON(
                ['error' => 'กรุณากรอกรหัสผ่านเดิมและรหัสผ่านใหม่']
            );
        }

        try {
            $this->authService->changePassword($userId, $oldPassword, $newPassword);
            return $this->response->setStatusCode(200)->setJSON(
                ['message' => 'เปลี่ยนรหัสผ่านสำเร็จ กรุณาเข้าสู่ระบบใหม่']
            );
        } catch (RuntimeException $e) {
            $httpCode = in_array($e->getCode(), [400, 404], true) ? $e->getCode() : 400;
            return $this->response->setStatusCode($httpCode)->setJSON(
                ['error' => $e->getMessage()]
            );
        }
    }
}
