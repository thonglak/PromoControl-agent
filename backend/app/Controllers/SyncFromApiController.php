<?php

namespace App\Controllers;

use App\Services\SyncFromApiService;
use CodeIgniter\HTTP\ResponseInterface;
use RuntimeException;

/**
 * SyncFromApiController — ดึงยูนิตจาก API ภายนอก (Narai Connect)
 *
 * เฉพาะ admin และ manager เท่านั้น (filter อยู่ใน Routes.php)
 * Business logic ทั้งหมดอยู่ใน SyncFromApiService
 */
class SyncFromApiController extends BaseController
{
    private SyncFromApiService $service;

    public function __construct()
    {
        $this->service = new SyncFromApiService();
    }

    private function userId(): int
    {
        return (int) ($this->request->user_id ?? 0);
    }

    private function isAdmin(): bool
    {
        return ($this->request->user_role ?? '') === 'admin';
    }

    private function canAccessProject(int $projectId): bool
    {
        if ($this->isAdmin()) return true;
        return in_array($projectId, array_map('intval', (array) ($this->request->project_ids ?? [])), true);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // POST /api/sync-from-api/fetch
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * ดึงข้อมูลจาก API ภายนอก → สร้าง snapshot table
     * Body: { config_id: int }
     */
    public function fetch(): ResponseInterface
    {
        $body     = $this->request->getJSON(true) ?? [];
        $configId = (int) ($body['config_id'] ?? 0);

        if ($configId <= 0) {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => 'กรุณาระบุ config_id']);
        }

        try {
            $result = $this->service->fetchFromApi($configId, $this->userId());

            $statusCode = $result['status'] === 'completed' ? 200 : 422;
            return $this->response->setStatusCode($statusCode)
                ->setJSON(['data' => $result]);

        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => $e->getMessage()]);
        } catch (\Throwable $e) {
            return $this->response->setStatusCode(500)
                ->setJSON(['error' => 'เกิดข้อผิดพลาดภายใน: ' . $e->getMessage()]);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // POST /api/sync-from-api/test
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * ทดสอบเรียก API โดยไม่สร้าง snapshot — debug mode
     * Body: { config_id?: int, url?: string }
     */
    public function test(): ResponseInterface
    {
        $body     = $this->request->getJSON(true) ?? [];
        $configId = !empty($body['config_id']) ? (int) $body['config_id'] : null;
        $url      = !empty($body['url'])       ? (string) $body['url']    : null;

        if (!$configId && !$url) {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => 'กรุณาระบุ config_id หรือ url']);
        }

        try {
            $result = $this->service->testApi($this->userId(), $configId, $url);
            return $this->response->setStatusCode(200)->setJSON(['data' => $result]);

        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => $e->getMessage()]);
        } catch (\Throwable $e) {
            return $this->response->setStatusCode(500)
                ->setJSON(['error' => 'เกิดข้อผิดพลาดภายใน: ' . $e->getMessage()]);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GET /api/sync-from-api?project_id=
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * รายการ snapshot ทั้งหมดของโครงการ พร้อม fetched_by_name
     */
    public function index(): ResponseInterface
    {
        $projectId = (int) ($this->request->getGet('project_id') ?? 0);
        if ($projectId <= 0) {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => 'กรุณาระบุ project_id']);
        }
        if (! $this->canAccessProject($projectId)) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        $page    = max(1, (int) ($this->request->getGet('page') ?? 1));
        $perPage = max(1, min(100, (int) ($this->request->getGet('per_page') ?? 20)));

        $result = $this->service->getSnapshotList($projectId, $page, $perPage);
        return $this->response->setStatusCode(200)->setJSON($result);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GET /api/sync-from-api/{id}
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * ดูข้อมูล snapshot + data จาก dynamic table (paginated)
     */
    public function show(int $id): ResponseInterface
    {
        $page    = max(1, (int) ($this->request->getGet('page') ?? 1));
        $perPage = max(1, min(100, (int) ($this->request->getGet('per_page') ?? 20)));

        try {
            $result = $this->service->getSnapshotData($id, $page, $perPage);

            // ตรวจ project access
            $projectId = (int) ($result['snapshot']['project_id'] ?? 0);
            if (! $this->canAccessProject($projectId)) {
                return $this->response->setStatusCode(403)
                    ->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
            }

            return $this->response->setStatusCode(200)->setJSON($result);

        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(404)
                ->setJSON(['error' => $e->getMessage()]);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // POST /api/sync-from-api/{id}/sync
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Sync ข้อมูลจาก snapshot เข้า project_units โดยใช้ mapping preset
     * Body: { preset_id: int }
     */
    public function sync(int $id): ResponseInterface
    {
        $body     = $this->request->getJSON(true) ?? [];
        $presetId = (int) ($body['preset_id'] ?? 0);

        if ($presetId <= 0) {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => 'กรุณาระบุ preset_id']);
        }

        try {
            // ตรวจ project access ก่อน
            $result    = $this->service->getSnapshotData($id, 1, 1);
            $projectId = (int) ($result['snapshot']['project_id'] ?? 0);

            if (! $this->canAccessProject($projectId)) {
                return $this->response->setStatusCode(403)
                    ->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
            }

            $syncResult = $this->service->syncSnapshotToUnits($id, $presetId, $this->userId());

            return $this->response->setStatusCode(200)
                ->setJSON(['data' => $syncResult]);

        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => $e->getMessage()]);
        } catch (\Throwable $e) {
            return $this->response->setStatusCode(500)
                ->setJSON(['error' => 'เกิดข้อผิดพลาดภายใน: ' . $e->getMessage()]);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // POST /api/sync-from-api/{id}/sync-house-models
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * สร้างแบบบ้านจากข้อมูล snapshot แล้วผูกกับ project_units
     * Body: { preset_id: int, house_model_field: string }
     */
    public function syncHouseModels(int $id): ResponseInterface
    {
        $body     = $this->request->getJSON(true) ?? [];
        $presetId = (int) ($body['preset_id'] ?? 0);

        if ($presetId <= 0) {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => 'กรุณาระบุ preset_id']);
        }

        try {
            // ตรวจ project access
            $result    = $this->service->getSnapshotData($id, 1, 1);
            $projectId = (int) ($result['snapshot']['project_id'] ?? 0);

            if (! $this->canAccessProject($projectId)) {
                return $this->response->setStatusCode(403)
                    ->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
            }

            $syncResult = $this->service->syncHouseModelsFromSnapshot($id, $presetId);

            return $this->response->setStatusCode(200)
                ->setJSON(['data' => $syncResult]);

        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => $e->getMessage()]);
        } catch (\Throwable $e) {
            return $this->response->setStatusCode(500)
                ->setJSON(['error' => 'เกิดข้อผิดพลาดภายใน: ' . $e->getMessage()]);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PUT /api/sync-from-api/{id}
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * แก้ไขชื่อแสดงผล (name) ของ snapshot — ไม่แก้ code เพราะ code เป็นชื่อ dynamic table
     * Body: { name: string }
     */
    public function update(int $id): ResponseInterface
    {
        $body = $this->request->getJSON(true) ?? [];
        $name = trim((string) ($body['name'] ?? ''));

        if ($name === '') {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => 'กรุณาระบุชื่อ']);
        }

        try {
            // ตรวจ project access ก่อน
            $result    = $this->service->getSnapshotData($id, 1, 1);
            $projectId = (int) ($result['snapshot']['project_id'] ?? 0);

            if (! $this->canAccessProject($projectId)) {
                return $this->response->setStatusCode(403)
                    ->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
            }

            $updated = $this->service->updateSnapshot($id, ['name' => $name]);

            return $this->response->setStatusCode(200)
                ->setJSON(['data' => $updated]);

        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(404)
                ->setJSON(['error' => $e->getMessage()]);
        } catch (\Throwable $e) {
            return $this->response->setStatusCode(500)
                ->setJSON(['error' => 'เกิดข้อผิดพลาดภายใน: ' . $e->getMessage()]);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DELETE /api/sync-from-api/{id}
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * ลบ snapshot record + DROP dynamic table
     */
    public function delete(int $id): ResponseInterface
    {
        try {
            // ดึง snapshot ก่อนเพื่อตรวจ project access
            $result    = $this->service->getSnapshotData($id, 1, 1);
            $projectId = (int) ($result['snapshot']['project_id'] ?? 0);

            if (! $this->canAccessProject($projectId)) {
                return $this->response->setStatusCode(403)
                    ->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
            }

            $this->service->deleteSnapshot($id);
            return $this->response->setStatusCode(200)
                ->setJSON(['message' => 'ลบ snapshot สำเร็จ']);

        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(404)
                ->setJSON(['error' => $e->getMessage()]);
        }
    }
}
