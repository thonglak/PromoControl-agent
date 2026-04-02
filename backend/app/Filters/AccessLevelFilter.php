<?php

namespace App\Filters;

use CodeIgniter\Filters\FilterInterface;
use CodeIgniter\HTTP\RequestInterface;
use CodeIgniter\HTTP\ResponseInterface;

/**
 * AccessLevelFilter — ตรวจ access_level ของ user ต่อ project ที่กำลังทำงาน
 *
 * วิธีใช้ใน Routes.php:
 *   $routes->group('...', ['filter' => 'access'], function ($routes) { ... });
 *
 * กฎ:
 *   - admin → ผ่านเสมอ (edit ทุก project)
 *   - write operations (POST/PUT/DELETE/PATCH) + access_level = 'view' → 403
 *   - ถ้าหา project_id ไม่ได้ → ผ่าน (ให้ controller จัดการ business logic)
 *
 * project_id หาจาก (ตามลำดับ):
 *   1. query string: ?project_id=X
 *   2. JSON body: { "project_id": X }
 *   3. route segment ที่มี pattern /projects/{id} หรือ /project/{id}
 */
class AccessLevelFilter implements FilterInterface
{
    /** HTTP methods ที่ถือว่าเป็น write operations */
    private const WRITE_METHODS = ['POST', 'PUT', 'DELETE', 'PATCH'];

    /**
     * ตรวจ access_level ก่อนส่ง request ไปยัง Controller
     *
     * @param  list<string>|null       $arguments  (ไม่ใช้)
     * @return ResponseInterface|void  void = ผ่าน, ResponseInterface = หยุด + return 403
     */
    public function before(RequestInterface $request, $arguments = null)
    {
        // admin มีสิทธิ์ edit ทุก project เสมอ
        $userRole = (string) ($request->user_role ?? '');
        if ($userRole === 'admin') {
            return;
        }

        // ตรวจเฉพาะ write operations
        $method = strtoupper($request->getMethod());
        if (! in_array($method, self::WRITE_METHODS, true)) {
            return;
        }

        // หา project_id จาก request
        $projectId = $this->resolveProjectId($request);
        if ($projectId === null) {
            return; // หา project_id ไม่ได้ → ให้ controller จัดการเอง
        }

        // ตรวจ access_level จาก JWT payload ที่ JwtAuthFilter set ไว้
        $projectAccess = $request->project_access ?? new \stdClass();
        $accessLevel   = (string) ($projectAccess->{(string) $projectId} ?? 'view');

        if ($accessLevel !== 'edit') {
            return $this->forbidden('คุณมีสิทธิ์ดูอย่างเดียว ไม่สามารถแก้ไขได้');
        }
    }

    /**
     * ไม่ต้องทำอะไรหลัง response
     */
    public function after(RequestInterface $request, ResponseInterface $response, $arguments = null): void {}

    /**
     * หา project_id จาก query string, JSON body, หรือ URI segment
     */
    private function resolveProjectId(RequestInterface $request): ?int
    {
        // 1. Query string: ?project_id=X
        $fromQuery = $request->getGet('project_id');
        if ($fromQuery !== null && ctype_digit((string) $fromQuery)) {
            return (int) $fromQuery;
        }

        // 2. JSON body: { "project_id": X }
        $body = $request->getJSON(true);
        if (is_array($body) && isset($body['project_id']) && is_numeric($body['project_id'])) {
            return (int) $body['project_id'];
        }

        // 3. URI segment: /api/projects/{id}/... หรือ /api/.../project/{id}
        $uri      = $request->getPath();
        $segments = explode('/', trim($uri, '/'));

        for ($i = 0; $i < count($segments) - 1; $i++) {
            $seg = strtolower($segments[$i]);
            if (in_array($seg, ['projects', 'project'], true)) {
                $next = $segments[$i + 1] ?? '';
                if (ctype_digit($next)) {
                    return (int) $next;
                }
            }
        }

        return null;
    }

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
