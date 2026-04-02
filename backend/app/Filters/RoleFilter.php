<?php

namespace App\Filters;

use CodeIgniter\Filters\FilterInterface;
use CodeIgniter\HTTP\RequestInterface;
use CodeIgniter\HTTP\ResponseInterface;

/**
 * RoleFilter — ตรวจสิทธิ์ตาม role ของ user ต่อ route ที่กำหนด
 *
 * วิธีใช้ใน Routes.php:
 *   $routes->group('users', ['filter' => 'role:admin'], function ($routes) { ... });
 *   $routes->group('budget', ['filter' => 'role:admin,manager'], function ($routes) { ... });
 *
 * หมายเหตุ: ต้องใช้ร่วมกับ jwt_auth filter เสมอ
 * เพราะ JwtAuthFilter จะ set $request->user_role ให้ก่อน
 */
class RoleFilter implements FilterInterface
{
    /**
     * ตรวจ role ก่อนส่ง request ไปยัง Controller
     *
     * @param  list<string>|null       $arguments   allowed roles จาก route config (เช่น ['admin', 'manager'])
     * @return ResponseInterface|void  void = ผ่าน, ResponseInterface = หยุด + return 403
     */
    public function before(RequestInterface $request, $arguments = null)
    {
        // ถ้าไม่ได้กำหนด allowed roles → อนุญาตผ่านทั้งหมด
        if (empty($arguments)) {
            return;
        }

        $userRole     = (string) ($request->user_role ?? '');
        $allowedRoles = $arguments;

        if (! in_array($userRole, $allowedRoles, true)) {
            return $this->forbidden('คุณไม่มีสิทธิ์เข้าถึงส่วนนี้');
        }
    }

    /**
     * ไม่ต้องทำอะไรหลัง response
     */
    public function after(RequestInterface $request, ResponseInterface $response, $arguments = null): void {}

    /**
     * สร้าง 403 Forbidden JSON response
     */
    private function forbidden(string $message): ResponseInterface
    {
        return service('response')
            ->setStatusCode(403)
            ->setContentType('application/json; charset=utf-8')
            ->setBody(json_encode(
                ['error' => $message],
                JSON_UNESCAPED_UNICODE
            ));
    }
}
