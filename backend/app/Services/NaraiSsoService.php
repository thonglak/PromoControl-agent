<?php

namespace App\Services;

use App\Models\UserModel;
use Config\AuthLoginResponse;
use Config\UserData;
use RuntimeException;

/**
 * NaraiSsoService — จัดการ OAuth2 Authorization Code Flow กับ Narai Connect
 *
 * Flow:
 *   1. buildAuthorizationUrl()  → สร้าง URL สำหรับ redirect ไปยัง Narai
 *   2. exchangeCodeForToken()   → แลก authorization_code กับ access_token
 *   3. fetchUserInfo()          → ดึงข้อมูล user จาก Narai resource endpoint
 *   4. provisionUser()          → สร้างหรืออัปเดต user ใน DB ของระบบ
 *   5. AuthService::generateAccessToken() → ออก JWT สำหรับระบบ
 *
 * Security:
 *   - ใช้ state parameter เพื่อป้องกัน CSRF
 *   - ห้าม log access_token จาก Narai
 *   - ใช้ HTTPS บน production (ตรวจ OAUTH2_REDIRECT_URI)
 */
class NaraiSsoService
{
    // ── Narai Connect Endpoints ──────────────────────────────────────────────

    private const AUTHORIZATION_URL = 'https://apps.naraiproperty.com/connect/oauth/authorize';
    private const TOKEN_URL          = 'https://apps.naraiproperty.com/connect/oauth/authorize/token';
    private const RESOURCE_URL       = 'https://apps.naraiproperty.com/connect/oauth/resource';
    private const SCOPE              = 'email';

    private UserModel  $userModel;
    private AuthService $authService;

    public function __construct()
    {
        $this->userModel   = new UserModel();
        $this->authService = new AuthService();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 1. buildAuthorizationUrl — สร้าง URL เพื่อ redirect ไป Narai Connect
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * สร้าง URL สำหรับ redirect user ไปยัง Narai Connect login page
     *
     * @param  string $state  random string สำหรับ CSRF protection (สร้างจาก frontend หรือ backend)
     * @return string         URL ที่ browser ต้อง redirect ไป
     * @throws RuntimeException ถ้า environment variables ไม่ครบ
     */
    public function buildAuthorizationUrl(string $state): string
    {
        $clientId    = $this->getRequiredEnv('OAUTH2_CLIENT_ID');
        $redirectUri = $this->getRequiredEnv('OAUTH2_REDIRECT_URI');

        return self::AUTHORIZATION_URL . '?' . http_build_query([
            'response_type' => 'code',
            'client_id'     => $clientId,
            'redirect_uri'  => $redirectUri,
            'scope'         => self::SCOPE,
            'state'         => $state,
        ]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. handleCallback — จัดการ callback จาก Narai Connect
    //    รวม: แลก code → token → user info → provision → ออก JWT
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * จัดการ OAuth2 callback ครบวงจร:
     * 1. แลก authorization_code กับ access_token
     * 2. ดึง user info จาก Narai
     * 3. สร้างหรืออัปเดต user ในระบบ
     * 4. เก็บ narai_access_token ไว้ใช้เรียก API ภายนอก
     * 5. ออก JWT access token + refresh token
     *
     * @param  string       $code           authorization_code จาก query string
     * @param  string|null  $userAgent
     * @param  string|null  $ipAddress
     * @return array        { access_token, token_type, expires_in, user }
     * @throws RuntimeException ถ้า token exchange หรือ user info ล้มเหลว
     */
    public function handleCallback(
        string  $code,
        ?string $userAgent  = null,
        ?string $ipAddress  = null
    ): array {
        // ขั้นตอน 2: แลก code กับ token
        $tokenData = $this->exchangeCodeForToken($code);

        // ขั้นตอน 3: ดึง user info
        $naraiUser = $this->fetchUserInfo($tokenData['access_token']);

        // ขั้นตอน 4: provision user (สร้างหรืออัปเดต)
        $user = $this->provisionUser($naraiUser);

        // ขั้นตอน 4.5: เก็บ narai_access_token ไว้ใช้เรียก API ภายนอก
        $this->userModel->update($user['id'], [
            'narai_access_token' => $tokenData['access_token'],
        ]);

        // ขั้นตอน 5: ดึง user พร้อม projects + ออก tokens
        $userWithProjects = $this->userModel->findWithProjects($user['id']);

        $accessToken  = $this->authService->generateAccessToken($userWithProjects);
        $refreshToken = $this->authService->generateRefreshToken($user['id'], $userAgent, $ipAddress);

        // Set refresh token เป็น httpOnly cookie (ผ่าน AuthService helper)
        $this->authService->setRefreshTokenCookie($refreshToken);

        return AuthLoginResponse::forLogin(
            $accessToken,
            UserData::fromArray($userWithProjects)
        )->toArray();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Private: exchangeCodeForToken
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * แลก authorization_code กับ access_token จาก Narai Token Endpoint
     *
     * @param  string $code  authorization_code จาก callback
     * @return array         { access_token, token_type, ... }
     * @throws RuntimeException ถ้า HTTP request ล้มเหลว
     */
    private function exchangeCodeForToken(string $code): array
    {
        $clientId     = $this->getRequiredEnv('OAUTH2_CLIENT_ID');
        $clientSecret = $this->getRequiredEnv('OAUTH2_CLIENT_SECRET');
        $redirectUri  = $this->getRequiredEnv('OAUTH2_REDIRECT_URI');

        $postData = http_build_query([
            'grant_type'    => 'authorization_code',
            'code'          => $code,
            'redirect_uri'  => $redirectUri,
            'client_id'     => $clientId,
            'client_secret' => $clientSecret,
        ]);

        $ch = curl_init(self::TOKEN_URL);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $postData,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/x-www-form-urlencoded',
                'Accept: application/json',
            ],
        ]);

        $body     = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr  = curl_error($ch);
        curl_close($ch);

        if ($curlErr !== '') {
            log_message('error', '[NaraiSso] Token exchange curl error: ' . $curlErr);
            throw new RuntimeException('ไม่สามารถเชื่อมต่อกับ Narai Connect ได้', 502);
        }

        $data = json_decode($body, true);

        if ($httpCode !== 200 || empty($data['access_token'])) {
            log_message('error', '[NaraiSso] Token exchange failed. HTTP ' . $httpCode);
            throw new RuntimeException('การยืนยันตัวตนกับ Narai Connect ล้มเหลว', 401);
        }

        return $data;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Private: fetchUserInfo
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * ดึงข้อมูล user จาก Narai Resource Endpoint
     *
     * หมายเหตุ: endpoint นี้ใช้ POST method (ไม่ใช่ GET — ตามสเปค Narai Connect)
     *
     * @param  string $accessToken  token จาก exchangeCodeForToken()
     * @return array                { id, name, email, username, photoURL, ... }
     * @throws RuntimeException ถ้าดึงข้อมูลไม่สำเร็จ
     */
    private function fetchUserInfo(string $accessToken): array
    {
        $ch = curl_init(self::RESOURCE_URL);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,  // Narai resource endpoint ใช้ POST
            CURLOPT_POSTFIELDS     => '',
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_HTTPHEADER     => [
                'Authorization: Bearer ' . $accessToken,
                'Accept: application/json',
                'Content-Type: application/json',
            ],
        ]);

        $body     = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr  = curl_error($ch);
        curl_close($ch);

        if ($curlErr !== '') {
            log_message('error', '[NaraiSso] User info curl error: ' . $curlErr);
            throw new RuntimeException('ไม่สามารถดึงข้อมูลผู้ใช้จาก Narai Connect ได้', 502);
        }

        $data = json_decode($body, true);

        if ($httpCode !== 200 || empty($data['id'])) {
            log_message('error', '[NaraiSso] User info failed. HTTP ' . $httpCode);
            throw new RuntimeException('ดึงข้อมูลผู้ใช้จาก Narai Connect ไม่สำเร็จ', 401);
        }

        return $data;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Private: provisionUser
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * สร้างหรืออัปเดต user ในระบบจากข้อมูล Narai Connect
     *
     * Logic:
     * 1. ค้นหา user ด้วย narai_id ก่อน (SSO user เดิม)
     * 2. ถ้าไม่พบ → ค้นหาด้วย email (local user ที่อาจมีอยู่แล้ว)
     * 3. ถ้าพบ email → link Narai ID เข้ากับ account เดิม
     * 4. ถ้าไม่พบเลย → สร้าง user ใหม่ด้วย role 'viewer' (admin ต้อง assign role ทีหลัง)
     *
     * @param  array $naraiUser  ข้อมูลจาก fetchUserInfo()
     * @return array             user record จาก DB { id, email, name, role, ... }
     * @throws RuntimeException ถ้า user ถูก deactivate
     */
    private function provisionUser(array $naraiUser): array
    {
        $naraiId    = (string) ($naraiUser['id'] ?? '');
        $email      = strtolower(trim((string) ($naraiUser['email'] ?? '')));
        $name       = trim((string) ($naraiUser['displayName'] ?? $naraiUser['name'] ?? ''));
        $avatarUrl  = (string) ($naraiUser['photoURL'] ?? '');
        $now        = date('Y-m-d H:i:s');

        // ── ค้นหา user ด้วย narai_id ───────────────────────────────────────
        $user = $this->userModel
            ->where('narai_id', $naraiId)
            ->first();

        if ($user !== null) {
            // SSO user เดิม — ตรวจ is_active
            if (! (bool) (int) ($user['is_active'])) {
                throw new RuntimeException('บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ', 403);
            }

            // อัปเดตข้อมูลที่อาจเปลี่ยนใน Narai (ชื่อ, รูป, last_login_at)
            $this->userModel->update($user['id'], [
                'name'          => $name ?: $user['name'],
                'avatar_url'    => $avatarUrl ?: $user['avatar_url'],
                'last_login_at' => $now,
                'updated_at'    => $now,
            ]);

            return $this->userModel->find($user['id']);
        }

        // ── ค้นหา user ด้วย email (กรณี local user ที่สร้างล่วงหน้า) ──────
        if ($email !== '') {
            $userByEmail = $this->userModel->where('email', $email)->first();

            if ($userByEmail !== null) {
                if (! (bool) (int) ($userByEmail['is_active'])) {
                    throw new RuntimeException('บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ', 403);
                }

                // Link Narai ID เข้ากับ account เดิม
                $this->userModel->update($userByEmail['id'], [
                    'narai_id'      => $naraiId,
                    'sso_provider'  => 'narai',
                    'name'          => $name ?: $userByEmail['name'],
                    'avatar_url'    => $avatarUrl ?: $userByEmail['avatar_url'],
                    'last_login_at' => $now,
                    'updated_at'    => $now,
                ]);

                return $this->userModel->find($userByEmail['id']);
            }
        }

        // ── สร้าง user ใหม่ (SSO provisioning) ────────────────────────────
        // กรณีไม่มี email จาก Narai → ใช้ username แทน
        $resolvedEmail = $email !== '' ? $email : ($naraiUser['username'] ?? $naraiId) . '@naraiproperty.local';

        // Default role = 'sales' (พนักงานขาย) สำหรับ user ใหม่ที่ login ผ่าน Narai SSO
        // admin สามารถเปลี่ยน role ภายหลังได้ที่หน้าจัดการผู้ใช้
        $userId = $this->userModel->insert([
            'narai_id'      => $naraiId,
            'sso_provider'  => 'narai',
            'email'         => $resolvedEmail,
            'password_hash' => null,   // SSO-only user ไม่มีรหัสผ่าน
            'name'          => $name ?: 'Narai User ' . $naraiId,
            'role'          => 'sales',
            'is_active'     => true,
            'last_login_at' => $now,
            'created_at'    => $now,
            'updated_at'    => $now,
        ]);

        log_message('info', '[NaraiSso] provisioned new user id=' . $userId . ' narai_id=' . $naraiId);

        return $this->userModel->find($userId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helper
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * ดึงค่า environment variable — throw ถ้าไม่ได้ตั้งค่า
     *
     * @throws RuntimeException ถ้า env var ไม่ได้ตั้งค่า
     */
    private function getRequiredEnv(string $key): string
    {
        $value = env($key, '');
        if ($value === '') {
            log_message('critical', '[NaraiSso] Environment variable not set: ' . $key);
            throw new RuntimeException('การตั้งค่า SSO ไม่ครบถ้วน กรุณาติดต่อผู้ดูแลระบบ', 500);
        }
        return $value;
    }
}
