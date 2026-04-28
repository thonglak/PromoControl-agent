<?php

namespace Tests\Integration;

/**
 * AuthTest -- Integration tests สำหรับ /api/auth endpoints
 *
 * ทดสอบ: setup, login, refresh, logout, me, check-setup
 * แต่ละ test เป็นอิสระ — ล้าง DB ก่อนทุก test
 */
final class AuthTest extends BaseIntegrationTest
{
    private const ADMIN_EMAIL    = 'testadmin@promo.test';
    private const ADMIN_PASSWORD = 'Admin@1234';
    private const ADMIN_NAME     = 'ผู้ดูแลระบบทดสอบ';

    protected function setUp(): void
    {
        parent::setUp();
        $this->cleanDatabase();
    }

    // ────────────────────────────────────────────────────────────────
    // Helper: สร้าง admin ผ่าน setup endpoint
    // ────────────────────────────────────────────────────────────────

    private function doSetup(): \CodeIgniter\Test\TestResponse
    {
        return $this->withBodyFormat('json')->post('api/auth/setup', [
            'email'    => self::ADMIN_EMAIL,
            'password' => self::ADMIN_PASSWORD,
            'name'     => self::ADMIN_NAME,
        ]);
    }

    private function getToken(): string
    {
        $this->doSetup();
        $result = $this->withBodyFormat('json')->post('api/auth/login', [
            'email'    => self::ADMIN_EMAIL,
            'password' => self::ADMIN_PASSWORD,
        ]);
        $json = json_decode($result->getJSON(), true);
        return $json['access_token'];
    }

    // ────────────────────────────────────────────────────────────────
    // 1. POST /api/auth/setup -- สร้าง admin คนแรก (ต้องสำเร็จ)
    // ────────────────────────────────────────────────────────────────

    public function testSetupFirstAdminSucceeds(): void
    {
        $result = $this->doSetup();

        $result->assertStatus(201);
        $json = json_decode($result->getJSON(), true);

        $this->assertArrayHasKey('message', $json);
        $this->assertArrayHasKey('user', $json);
        $this->assertEquals(self::ADMIN_EMAIL, $json['user']['email']);
        $this->assertEquals(self::ADMIN_NAME, $json['user']['name']);
        $this->assertEquals('admin', $json['user']['role']);
    }

    // ────────────────────────────────────────────────────────────────
    // 2. POST /api/auth/setup -- เรียกครั้งที่สองต้อง 403
    // ────────────────────────────────────────────────────────────────

    public function testSetupSecondCallReturns403(): void
    {
        $this->doSetup();

        $result = $this->withBodyFormat('json')->post('api/auth/setup', [
            'email'    => 'another@promo.test',
            'password' => 'Another@1234',
            'name'     => 'Admin ตัวที่สอง',
        ]);

        $result->assertStatus(403);
        $json = json_decode($result->getJSON(), true);
        $this->assertArrayHasKey('error', $json);
    }

    // ────────────────────────────────────────────────────────────────
    // 3. POST /api/auth/login -- credentials ถูกต้อง ต้อง 200 + token
    // ────────────────────────────────────────────────────────────────

    public function testLoginValidCredentialsReturns200(): void
    {
        $this->doSetup();

        $result = $this->withBodyFormat('json')->post('api/auth/login', [
            'email'    => self::ADMIN_EMAIL,
            'password' => self::ADMIN_PASSWORD,
        ]);

        $result->assertStatus(200);
        $json = json_decode($result->getJSON(), true);

        $this->assertArrayHasKey('access_token', $json);
        $this->assertArrayHasKey('token_type', $json);
        $this->assertEquals('Bearer', $json['token_type']);
        $this->assertArrayHasKey('expires_in', $json);
        $this->assertArrayHasKey('user', $json);
        $this->assertEquals(self::ADMIN_EMAIL, $json['user']['email']);
        $this->assertEquals('admin', $json['user']['role']);
    }

    // ────────────────────────────────────────────────────────────────
    // 4. POST /api/auth/login -- credentials ไม่ถูกต้อง ต้อง 401
    // ────────────────────────────────────────────────────────────────

    public function testLoginInvalidCredentialsReturns401(): void
    {
        $this->doSetup();

        $result = $this->withBodyFormat('json')->post('api/auth/login', [
            'email'    => self::ADMIN_EMAIL,
            'password' => 'WrongPassword@999',
        ]);

        $result->assertStatus(401);
        $json = json_decode($result->getJSON(), true);
        $this->assertArrayHasKey('error', $json);
    }

    // ────────────────────────────────────────────────────────────────
    // 5. POST /api/auth/refresh -- ไม่มี cookie ต้อง 401
    // ────────────────────────────────────────────────────────────────

    public function testRefreshWithoutCookieReturns401(): void
    {
        $result = $this->withBodyFormat('json')->post('api/auth/refresh');

        $result->assertStatus(401);
        $json = json_decode($result->getJSON(), true);
        $this->assertArrayHasKey('error', $json);
    }

    // ────────────────────────────────────────────────────────────────
    // 6. POST /api/auth/logout -- ต้อง 200 เมื่อมี valid token
    // ────────────────────────────────────────────────────────────────

    public function testLogoutWithValidTokenReturns200(): void
    {
        $token = $this->getToken();

        $result = $this->withHeaders($this->authHeaders($token))
                       ->withBodyFormat('json')
                       ->post('api/auth/logout');

        $result->assertStatus(200);
        $json = json_decode($result->getJSON(), true);
        $this->assertArrayHasKey('message', $json);
    }

    // ────────────────────────────────────────────────────────────────
    // 7. GET /api/auth/me -- returns current user with permissions
    // ────────────────────────────────────────────────────────────────

    public function testMeWithValidTokenReturnsUserProfile(): void
    {
        $token = $this->getToken();

        $result = $this->withHeaders($this->authHeaders($token))
                       ->get('api/auth/me');

        $result->assertStatus(200);
        $json = json_decode($result->getJSON(), true);

        $this->assertArrayHasKey('id', $json);
        $this->assertArrayHasKey('email', $json);
        $this->assertArrayHasKey('name', $json);
        $this->assertArrayHasKey('role', $json);
        $this->assertArrayHasKey('permissions', $json);
        $this->assertEquals(self::ADMIN_EMAIL, $json['email']);
        $this->assertEquals('admin', $json['role']);

        // ตรวจโครงสร้าง permissions ตาม API spec
        $this->assertArrayHasKey('sales_entry', $json['permissions']);
        $this->assertArrayHasKey('budget', $json['permissions']);
        $this->assertArrayHasKey('master_data', $json['permissions']);
        $this->assertArrayHasKey('user_management', $json['permissions']);

        // admin ต้องไม่มี password_hash ใน response
        $this->assertArrayNotHasKey('password_hash', $json);
    }

    // ────────────────────────────────────────────────────────────────
    // 8. GET /api/auth/me -- ไม่มี token ต้อง 401
    // ────────────────────────────────────────────────────────────────

    public function testMeWithoutTokenReturns401(): void
    {
        $result = $this->get('api/auth/me');

        $result->assertStatus(401);
        $json = json_decode($result->getJSON(), true);
        $this->assertArrayHasKey('error', $json);
    }

    // ────────────────────────────────────────────────────────────────
    // เพิ่มเติม: GET /api/auth/check-setup
    // ────────────────────────────────────────────────────────────────

    public function testCheckSetupWhenEmpty(): void
    {
        $result = $this->get('api/auth/check-setup');
        $result->assertStatus(200);
        $json = json_decode($result->getJSON(), true);
        $this->assertFalse($json['has_users']);
    }

    public function testCheckSetupWhenHasUsers(): void
    {
        $this->doSetup();

        $result = $this->get('api/auth/check-setup');
        $result->assertStatus(200);
        $json = json_decode($result->getJSON(), true);
        $this->assertTrue($json['has_users']);
    }
}
