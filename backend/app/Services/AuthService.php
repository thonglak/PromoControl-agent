<?php

namespace App\Services;

use App\Models\UserModel;
use App\Models\RefreshTokenModel;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use RuntimeException;

/**
 * AuthService — business logic ทั้งหมดสำหรับ Authentication
 *
 * Security rules:
 * - ห้าม return password_hash หรือ token_hash ใน response เด็ดขาด
 * - ห้าม log password หรือ token ใน log files
 * - Failed login 5 ครั้งติดต่อกัน → ล็อคบัญชี 15 นาที
 * - Token revocation เมื่อเปลี่ยนรหัสผ่าน
 */
class AuthService
{
    // อายุ access token (วินาที)
    private const ACCESS_TOKEN_TTL = 3600; // 60 นาที

    // อายุ refresh token (วินาที)
    private const REFRESH_TOKEN_TTL = 30 * 24 * 3600; // 30 วัน

    // จำนวนครั้ง login ผิดสูงสุดก่อนล็อค
    private const MAX_FAILED_ATTEMPTS = 5;

    // ระยะเวลาล็อค (วินาที)
    private const LOCKOUT_DURATION = 15 * 60; // 15 นาที

    // bcrypt cost factor
    private const BCRYPT_COST = 12;

    // ชื่อ cookie สำหรับ refresh token
    private const REFRESH_COOKIE_NAME = 'refresh_token';

    private UserModel        $userModel;
    private RefreshTokenModel $tokenModel;

    public function __construct()
    {
        $this->userModel  = new UserModel();
        $this->tokenModel = new RefreshTokenModel();
    }

    // ─────────────────────────────────────────────────────────
    // 1. checkSetup — ตรวจว่ายังไม่มี user ในระบบ
    // ─────────────────────────────────────────────────────────

    /**
     * ตรวจว่า users table ว่างเปล่า (ยังไม่มี admin)
     * return true = ต้อง setup, false = มี user แล้ว
     */
    public function checkSetup(): bool
    {
        return $this->userModel->countAllResults() === 0;
    }

    // ─────────────────────────────────────────────────────────
    // 2. setup — สร้าง admin คนแรก (ใช้ได้ครั้งเดียว)
    // ─────────────────────────────────────────────────────────

    /**
     * สร้าง admin คนแรก — ใช้ได้เฉพาะเมื่อ users table ว่างเปล่าเท่านั้น
     *
     * @throws RuntimeException ถ้ามี user อยู่แล้ว
     */
    public function setup(string $email, string $password, string $name): array
    {
        // ตรวจว่ายังไม่มี user — ถ้ามีแล้ว throw ทันที ไม่มีข้อยกเว้น
        if (! $this->checkSetup()) {
            throw new RuntimeException('ระบบมีผู้ใช้งานแล้ว ไม่สามารถใช้ setup ได้', 403);
        }

        $this->validatePasswordStrength($password);

        $now    = date('Y-m-d H:i:s');
        $userId = $this->userModel->insert([
            'email'         => strtolower(trim($email)),
            'password_hash' => $this->hashPassword($password),
            'name'          => $name,
            'role'          => 'admin',
            'is_active'     => true,
            'created_at'    => $now,
            'updated_at'    => $now,
        ]);

        return [
            'id'    => $userId,
            'email' => strtolower(trim($email)),
            'name'  => $name,
            'role'  => 'admin',
        ];
    }

    // ─────────────────────────────────────────────────────────
    // 3. login — ตรวจ credentials + ออก tokens
    // ─────────────────────────────────────────────────────────

    /**
     * Login ด้วย email + password
     * - ตรวจ lockout ก่อน
     * - ตรวจ credentials
     * - ออก access token + refresh token
     * - Set refresh token เป็น httpOnly cookie
     *
     * @throws RuntimeException รหัสผ่านผิด / account ไม่ active / ถูกล็อค
     */
    public function login(string $email, string $password, ?string $userAgent = null, ?string $ipAddress = null): array
    {
        $email = strtolower(trim($email));

        // ค้นหา user ด้วย email (ใช้ query โดยตรงเพื่อดึง password_hash)
        $user = $this->userModel->where('email', $email)->first();

        if ($user === null) {
            // ไม่พบ email — ไม่บอกว่า email หรือรหัสผ่านผิดอันไหน (security)
            throw new RuntimeException('อีเมลหรือรหัสผ่านไม่ถูกต้อง', 401);
        }

        // ตรวจ lockout
        if ($this->isLocked($user)) {
            $remaining = $this->getLockoutRemainingMinutes($user);
            throw new RuntimeException(
                "บัญชีถูกล็อคชั่วคราว กรุณารอ {$remaining} นาทีแล้วลองใหม่",
                429
            );
        }

        // ตรวจ is_active
        if (! $user['is_active']) {
            throw new RuntimeException('บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ', 403);
        }

        // ตรวจ password
        if (! $this->verifyPassword($password, $user['password_hash'])) {
            $this->recordFailedAttempt($user);
            throw new RuntimeException('อีเมลหรือรหัสผ่านไม่ถูกต้อง', 401);
        }

        // Login สำเร็จ — reset failed attempts + อัปเดต last_login_at
        $this->userModel->update($user['id'], [
            'failed_attempts' => 0,
            'locked_until'    => null,
            'last_login_at'   => date('Y-m-d H:i:s'),
            'updated_at'      => date('Y-m-d H:i:s'),
        ]);

        // ดึง user พร้อม projects (ไม่รวม password_hash)
        $userWithProjects = $this->userModel->findWithProjects($user['id']);

        // ออก tokens
        $accessToken  = $this->generateAccessToken($userWithProjects);
        $refreshToken = $this->generateRefreshToken($user['id'], $userAgent, $ipAddress);

        // Set refresh token เป็น httpOnly cookie
        $this->setRefreshTokenCookie($refreshToken);

        return [
            'access_token' => $accessToken,
            'token_type'   => 'Bearer',
            'expires_in'   => self::ACCESS_TOKEN_TTL,
            'user'         => $this->formatUserResponse($userWithProjects),
        ];
    }

    // ─────────────────────────────────────────────────────────
    // 4. refresh — ออก access token ใหม่จาก refresh token
    // ─────────────────────────────────────────────────────────

    /**
     * Refresh access token โดยใช้ refresh token จาก httpOnly cookie
     * - ตรวจ validity + expiry + revoked status
     * - Revoke token เดิม + สร้างใหม่ทั้ง access + refresh (rotation)
     *
     * @throws RuntimeException token ไม่ valid
     */
    public function refresh(string $rawRefreshToken, ?string $userAgent = null, ?string $ipAddress = null): array
    {
        $tokenHash = $this->hashToken($rawRefreshToken);
        $record    = $this->tokenModel->findValidToken($tokenHash);

        if ($record === null) {
            throw new RuntimeException('Refresh token ไม่ถูกต้องหรือหมดอายุ กรุณาเข้าสู่ระบบใหม่', 401);
        }

        $user = $this->userModel->find($record['user_id']);
        if ($user === null || ! $user['is_active']) {
            throw new RuntimeException('บัญชีนี้ถูกระงับการใช้งาน', 403);
        }

        // Revoke token เดิม (token rotation — ป้องกัน token reuse)
        $this->tokenModel->revokeToken($tokenHash);

        // ดึง user พร้อม projects
        $userWithProjects = $this->userModel->findWithProjects($user['id']);

        // ออก tokens ใหม่
        $newAccessToken  = $this->generateAccessToken($userWithProjects);
        $newRefreshToken = $this->generateRefreshToken($user['id'], $userAgent, $ipAddress);

        // Set refresh token cookie ใหม่
        $this->setRefreshTokenCookie($newRefreshToken);

        return [
            'access_token' => $newAccessToken,
            'token_type'   => 'Bearer',
            'expires_in'   => self::ACCESS_TOKEN_TTL,
        ];
    }

    // ─────────────────────────────────────────────────────────
    // 5. logout — Revoke refresh token + Clear cookie
    // ─────────────────────────────────────────────────────────

    /**
     * Logout: revoke refresh token และ clear cookie
     */
    public function logout(string $rawRefreshToken): void
    {
        if ($rawRefreshToken !== '') {
            $tokenHash = $this->hashToken($rawRefreshToken);
            $this->tokenModel->revokeToken($tokenHash);
        }

        // Clear httpOnly cookie
        $this->clearRefreshTokenCookie();
    }

    // ─────────────────────────────────────────────────────────
    // 6. me — ดึง user data + projects + permissions
    // ─────────────────────────────────────────────────────────

    /**
     * ดึงข้อมูล user ปัจจุบัน พร้อม projects และ permissions
     * ไม่รวม password_hash หรือ token_hash
     *
     * @throws RuntimeException ไม่พบ user
     */
    public function me(int $userId): array
    {
        $user = $this->userModel->findWithProjects($userId);

        if ($user === null) {
            throw new RuntimeException('ไม่พบผู้ใช้งาน', 404);
        }

        return array_merge(
            $this->formatUserResponse($user),
            ['permissions' => $this->buildPermissions($user['role'])]
        );
    }

    // ─────────────────────────────────────────────────────────
    // 7. changePassword — เปลี่ยนรหัสผ่าน + Revoke all tokens
    // ─────────────────────────────────────────────────────────

    /**
     * เปลี่ยนรหัสผ่าน:
     * 1. ตรวจ old password
     * 2. ตรวจ password rules
     * 3. Hash และบันทึก password ใหม่
     * 4. Revoke refresh tokens ทั้งหมด (force re-login)
     *
     * @throws RuntimeException รหัสผ่านเดิมผิด / ไม่ตรงตาม rules
     */
    public function changePassword(int $userId, string $oldPassword, string $newPassword): void
    {
        // ดึง user พร้อม password_hash สำหรับตรวจสอบ
        $user = $this->userModel->find($userId);
        if ($user === null) {
            throw new RuntimeException('ไม่พบผู้ใช้งาน', 404);
        }

        // ตรวจ old password
        if (! $this->verifyPassword($oldPassword, $user['password_hash'])) {
            throw new RuntimeException('รหัสผ่านเดิมไม่ถูกต้อง', 400);
        }

        // ตรวจ password rules
        $this->validatePasswordStrength($newPassword);

        // ห้ามใช้รหัสผ่านเดิม
        if ($this->verifyPassword($newPassword, $user['password_hash'])) {
            throw new RuntimeException('รหัสผ่านใหม่ต้องแตกต่างจากรหัสผ่านเดิม', 400);
        }

        // บันทึก password ใหม่
        $this->userModel->update($userId, [
            'password_hash' => $this->hashPassword($newPassword),
            'updated_at'    => date('Y-m-d H:i:s'),
        ]);

        // Revoke ทุก refresh token (force re-login ทุก device)
        $this->tokenModel->revokeAllForUser($userId);

        // Clear cookie session ปัจจุบัน
        $this->clearRefreshTokenCookie();
    }

    // ─────────────────────────────────────────────────────────
    // 8. generateAccessToken — สร้าง JWT access token
    // ─────────────────────────────────────────────────────────

    /**
     * สร้าง JWT access token (HS256, 60 นาที)
     * Payload รวม project_ids และ project_access map
     */
    public function generateAccessToken(array $user): string
    {
        $secret   = $this->getJwtSecret();
        $projects = $user['projects'] ?? [];

        // สร้าง project_ids array และ project_access map
        $projectIds    = array_map('intval', array_column($projects, 'id'));
        $projectAccess = [];
        foreach ($projects as $p) {
            $projectAccess[(string) $p['id']] = $p['access_level'];
        }

        $now     = time();
        $payload = [
            'sub'            => (int) $user['id'],
            'email'          => $user['email'],
            'name'           => $user['name'],
            'role'           => $user['role'],
            'project_ids'    => $projectIds,
            'project_access' => $projectAccess,
            'iat'            => $now,
            'exp'            => $now + self::ACCESS_TOKEN_TTL,
        ];

        return JWT::encode($payload, $secret, 'HS256');
    }

    // ─────────────────────────────────────────────────────────
    // 9. hashPassword — bcrypt cost 12
    // ─────────────────────────────────────────────────────────

    /**
     * Hash รหัสผ่านด้วย bcrypt cost factor 12
     */
    public function hashPassword(string $password): string
    {
        return password_hash($password, PASSWORD_BCRYPT, ['cost' => self::BCRYPT_COST]);
    }

    // ─────────────────────────────────────────────────────────
    // Private helpers
    // ─────────────────────────────────────────────────────────

    /**
     * ตรวจ password ด้วย bcrypt
     */
    public function verifyPassword(string $password, string $hash): bool
    {
        return password_verify($password, $hash);
    }

    /**
     * ตรวจว่าบัญชีถูกล็อคอยู่หรือไม่
     */
    private function isLocked(array $user): bool
    {
        if (empty($user['locked_until'])) {
            return false;
        }
        return strtotime($user['locked_until']) > time();
    }

    /**
     * คำนวณเวลาที่เหลือก่อน unlock (นาที)
     */
    private function getLockoutRemainingMinutes(array $user): int
    {
        $remaining = strtotime($user['locked_until']) - time();
        return max(1, (int) ceil($remaining / 60));
    }

    /**
     * บันทึก failed attempt + ล็อคบัญชีถ้าถึงขีดจำกัด
     */
    private function recordFailedAttempt(array $user): void
    {
        $attempts = (int) $user['failed_attempts'] + 1;
        $data     = [
            'failed_attempts' => $attempts,
            'updated_at'      => date('Y-m-d H:i:s'),
        ];

        if ($attempts >= self::MAX_FAILED_ATTEMPTS) {
            // ล็อคบัญชี 15 นาที
            $data['locked_until'] = date('Y-m-d H:i:s', time() + self::LOCKOUT_DURATION);
        }

        $this->userModel->update($user['id'], $data);
    }

    /**
     * สร้าง refresh token:
     * - Raw token: random hex 64 chars
     * - เก็บ SHA-256 hash ใน DB (ไม่เก็บ raw token)
     * - Return raw token สำหรับ set ใน cookie
     */
    private function generateRefreshToken(int $userId, ?string $userAgent = null, ?string $ipAddress = null): string
    {
        $rawToken  = bin2hex(random_bytes(32)); // 64-char hex
        $tokenHash = $this->hashToken($rawToken);

        $this->tokenModel->insert([
            'user_id'    => $userId,
            'token_hash' => $tokenHash,
            'expires_at' => date('Y-m-d H:i:s', time() + self::REFRESH_TOKEN_TTL),
            'revoked'    => false,
            'user_agent' => $userAgent !== null ? substr($userAgent, 0, 500) : null,
            'ip_address' => $ipAddress,
            'created_at' => date('Y-m-d H:i:s'),
        ]);

        return $rawToken;
    }

    /**
     * Hash token ด้วย SHA-256 (สำหรับเก็บใน DB)
     */
    private function hashToken(string $rawToken): string
    {
        return hash('sha256', $rawToken);
    }

    /**
     * Set httpOnly cookie สำหรับ refresh token
     * path=/api/auth — จำกัดเฉพาะ auth endpoints
     */
    private function setRefreshTokenCookie(string $rawToken): void
    {
        $response = service('response');
        $response->setCookie([
            'name'     => self::REFRESH_COOKIE_NAME,
            'value'    => $rawToken,
            'expire'   => self::REFRESH_TOKEN_TTL,
            'httponly' => true,
            'secure'   => false,   // ตั้ง true บน production (HTTPS)
            'samesite' => 'Strict',
            'path'     => '/api/auth',
        ]);
    }

    /**
     * Clear refresh token cookie เมื่อ logout
     */
    private function clearRefreshTokenCookie(): void
    {
        $response = service('response');
        $response->deleteCookie(self::REFRESH_COOKIE_NAME, '', '/api/auth');
    }

    /**
     * ดึง JWT_SECRET จาก .env — ต้องมีค่าเสมอ
     *
     * @throws RuntimeException ถ้าไม่ได้ตั้งค่า JWT_SECRET
     */
    private function getJwtSecret(): string
    {
        $secret = env('JWT_SECRET', '');
        if ($secret === '') {
            // ไม่ log ค่า secret — log แค่ข้อความ error
            throw new RuntimeException('JWT_SECRET ไม่ได้ตั้งค่าใน .env', 500);
        }
        return $secret;
    }

    /**
     * ตรวจ password strength:
     * - อย่างน้อย 8 ตัวอักษร
     * - มี uppercase, lowercase, ตัวเลข
     *
     * @throws RuntimeException ถ้าไม่ผ่าน rules
     */
    private function validatePasswordStrength(string $password): void
    {
        if (strlen($password) < 8) {
            throw new RuntimeException('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร', 400);
        }
        if (! preg_match('/[A-Z]/', $password)) {
            throw new RuntimeException('รหัสผ่านต้องมีตัวพิมพ์ใหญ่อย่างน้อย 1 ตัว', 400);
        }
        if (! preg_match('/[a-z]/', $password)) {
            throw new RuntimeException('รหัสผ่านต้องมีตัวพิมพ์เล็กอย่างน้อย 1 ตัว', 400);
        }
        if (! preg_match('/[0-9]/', $password)) {
            throw new RuntimeException('รหัสผ่านต้องมีตัวเลขอย่างน้อย 1 ตัว', 400);
        }
    }

    /**
     * สร้าง permissions object ตาม role
     * ดูตาราง Permission Matrix ใน docs/08-authentication.md
     */
    private function buildPermissions(string $role): array
    {
        $isAdmin   = $role === 'admin';
        $isManager = in_array($role, ['admin', 'manager'], true);
        $canSales  = in_array($role, ['admin', 'manager', 'sales'], true);
        $canView   = true; // ทุก role ดูข้อมูลได้

        return [
            'sales_entry' => [
                'create'   => $canSales,
                'view_own' => $canView,
                'view_all' => in_array($role, ['admin', 'manager', 'finance', 'viewer'], true),
            ],
            'budget' => [
                'transfer' => $isManager,
                'approve'  => $isManager,
                'view'     => $canView,
            ],
            'master_data' => [
                'project'   => $isAdmin,
                'unit'      => $isManager,
                'promotion' => $isManager,
            ],
            'bottom_line' => [
                'import'   => $isManager,
                'history'  => in_array($role, ['admin', 'manager', 'finance', 'viewer'], true),
                'rollback' => $isAdmin,
                'mapping'  => $isManager,
            ],
            'reports'         => in_array($role, ['admin', 'manager', 'finance', 'viewer'], true),
            'user_management' => $isAdmin,
            'settings'        => $isAdmin,
        ];
    }

    /**
     * จัด format user data สำหรับ API response (ไม่มี password_hash)
     * รวม permissions เสมอ เพื่อให้ frontend แสดงเมนูได้ถูกต้องตั้งแต่ login ครั้งแรก
     */
    private function formatUserResponse(array $user): array
    {
        return [
            'id'          => (int) $user['id'],
            'email'       => $user['email'],
            'name'        => $user['name'],
            'role'        => $user['role'],
            'phone'       => $user['phone'] ?? null,
            'avatar_url'  => $user['avatar_url'] ?? null,
            'is_active'   => (bool) $user['is_active'],
            'projects'    => $user['projects'] ?? [],
            'permissions' => $this->buildPermissions($user['role']),
        ];
    }
}
