<?php

namespace App\Filters;

use App\Models\UserModel;
use CodeIgniter\Filters\FilterInterface;
use CodeIgniter\HTTP\RequestInterface;
use CodeIgniter\HTTP\ResponseInterface;
use Firebase\JWT\ExpiredException;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Throwable;

/**
 * JwtAuthFilter — ตรวจ JWT token สำหรับทุก /api/* routes
 *
 * Flow:
 *   1. ตรวจ Authorization: Bearer {token}
 *   2. Decode ด้วย firebase/php-jwt + JWT_SECRET
 *   3. ตรวจ exp (firebase/php-jwt ตรวจอัตโนมัติ)
 *   4. ตรวจ user จาก DB + is_active = true
 *   5. Set user data ลง request attributes
 *
 * Security: ห้าม log ค่า token ใน log files
 */
class JwtAuthFilter implements FilterInterface
{
    /**
     * Routes ที่ยกเว้น (public auth endpoints — ไม่ต้องตรวจ JWT)
     */
    private const EXEMPT_URIS = [
        'api/auth/check-setup',
        'api/auth/setup',
        'api/auth/login',
        'api/auth/refresh',
    ];

    /**
     * ตรวจ JWT ก่อนส่ง request ไปยัง Controller
     *
     * @param  list<string>|null       $arguments
     * @return ResponseInterface|void  void = ผ่าน, ResponseInterface = หยุด + return 401
     */
    public function before(RequestInterface $request, $arguments = null)
    {
        // ตรวจว่า URI ปัจจุบันอยู่ในรายการยกเว้นหรือไม่
        $currentUri = trim($request->getPath(), '/');
        foreach (self::EXEMPT_URIS as $exempt) {
            if ($currentUri === $exempt) {
                return; // ผ่านได้ ไม่ต้องตรวจ token
            }
        }

        // ── ขั้นตอน 1: ตรวจ Authorization header ──────────────────────────
        $authHeader = $request->getHeaderLine('Authorization');
        if (empty($authHeader) || ! str_starts_with($authHeader, 'Bearer ')) {
            return $this->unauthorized('กรุณาเข้าสู่ระบบ');
        }

        $token = substr($authHeader, 7); // ตัด "Bearer " (7 ตัว) ออก

        // ── ขั้นตอน 2-3: Decode + ตรวจ JWT ────────────────────────────────
        $secret = env('JWT_SECRET', '');
        if ($secret === '') {
            log_message('critical', '[JwtAuthFilter] JWT_SECRET ไม่ได้ตั้งค่าใน .env');
            return $this->unauthorized('กรุณาเข้าสู่ระบบ');
        }

        try {
            // JWT::decode ตรวจ signature + exp อัตโนมัติ
            $payload = JWT::decode($token, new Key($secret, 'HS256'));
        } catch (ExpiredException $e) {
            // Token หมดอายุ — บอก client ให้ refresh
            return $this->unauthorized('Token หมดอายุ กรุณาเข้าสู่ระบบใหม่');
        } catch (Throwable $e) {
            // ไม่ log ค่า token — log แค่ class ของ exception เพื่อ debug
            log_message('notice', '[JwtAuthFilter] JWT decode failed: ' . get_class($e));
            return $this->unauthorized('Token ไม่ถูกต้อง');
        }

        // ── ขั้นตอน 4: ตรวจ user จาก DB ───────────────────────────────────
        $userId = (int) ($payload->sub ?? 0);
        if ($userId === 0) {
            return $this->unauthorized('Token ไม่ถูกต้อง');
        }

        $userModel = new UserModel();
        $user      = $userModel->select('id, is_active')
                               ->find($userId);

        if ($user === null) {
            return $this->unauthorized('Token ไม่ถูกต้อง');
        }

        if (! (bool) $user['is_active']) {
            return $this->unauthorized('บัญชีถูกระงับ');
        }

        // ── ขั้นตอน 5: Set user data ลง request attributes ─────────────────
        //
        // หมายเหตุ PHP 8.2: dynamic properties บน IncomingRequest จะ log
        // เป็น E_DEPRECATED แต่ไม่ throw exception เนื่องจาก CI4 config
        // logDeprecations = true (ดู app/Config/Exceptions.php)
        // Controller เข้าถึงด้วย $this->request->user_id เป็นต้น
        //
        $request->user_id        = $userId;
        $request->user_email     = (string) ($payload->email ?? '');
        $request->user_role      = (string) ($payload->role  ?? '');
        $request->project_ids    = (array)  ($payload->project_ids    ?? []);
        $request->project_access = $payload->project_access ?? new \stdClass();
    }

    /**
     * ไม่ต้องทำอะไรหลัง response
     */
    public function after(RequestInterface $request, ResponseInterface $response, $arguments = null): void {}

    /**
     * สร้าง 401 Unauthorized JSON response
     * - error message เป็นภาษาไทย
     * - JSON_UNESCAPED_UNICODE เพื่อให้ภาษาไทยไม่เป็น \uXXXX
     */
    private function unauthorized(string $message): ResponseInterface
    {
        return service('response')
            ->setStatusCode(401)
            ->setContentType('application/json; charset=utf-8')
            ->setBody(json_encode(
                ['error' => $message],
                JSON_UNESCAPED_UNICODE
            ));
    }
}
