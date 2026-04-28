<?php

namespace App\Controllers;

use App\Models\ExternalApiConfigModel;
use CodeIgniter\HTTP\ResponseInterface;
use RuntimeException;

/**
 * ExternalApiConfigController — ตั้งค่า API ภายนอกสำหรับดึงข้อมูลยูนิต
 *
 * เฉพาะ admin และ manager เท่านั้น (filter อยู่ใน Routes.php)
 * Business logic: ใช้ Model โดยตรง (config ไม่มี business rule ซับซ้อน)
 */
class ExternalApiConfigController extends BaseController
{
    private ExternalApiConfigModel $model;

    public function __construct()
    {
        $this->model = new ExternalApiConfigModel();
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
    // GET /api/external-api-configs?project_id=
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * รายการ config ทั้งหมดของโครงการที่เลือก
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

        $configs = $this->model
            ->where('project_id', $projectId)
            ->orderBy('created_at', 'DESC')
            ->findAll();

        return $this->response->setStatusCode(200)
            ->setJSON(['data' => $configs]);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // POST /api/external-api-configs
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * สร้าง config ใหม่
     * Required: project_id, name, api_url
     */
    public function create(): ResponseInterface
    {
        $body      = $this->request->getJSON(true) ?? [];
        $projectId = (int) ($body['project_id'] ?? 0);
        $name      = trim($body['name'] ?? '');
        $apiUrl    = trim($body['api_url'] ?? '');

        if ($projectId <= 0) {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => 'กรุณาระบุ project_id']);
        }
        if ($name === '') {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => 'กรุณาระบุชื่อ config']);
        }
        if ($apiUrl === '') {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => 'กรุณาระบุ api_url']);
        }
        if (! $this->canAccessProject($projectId)) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        $isActive = isset($body['is_active']) ? (bool) $body['is_active'] : true;

        $id = $this->model->insert([
            'project_id' => $projectId,
            'name'       => $name,
            'api_url'    => $apiUrl,
            'is_active'  => $isActive,
            'created_by' => $this->userId(),
        ]);

        $config = $this->model->find($id);
        return $this->response->setStatusCode(201)
            ->setJSON(['data' => $config]);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PUT /api/external-api-configs/{id}
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * แก้ไข config
     */
    public function update(int $id): ResponseInterface
    {
        $config = $this->model->find($id);
        if (! $config) {
            return $this->response->setStatusCode(404)
                ->setJSON(['error' => 'ไม่พบ config นี้']);
        }
        if (! $this->canAccessProject((int) $config['project_id'])) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        $body = $this->request->getJSON(true) ?? [];

        $updateData = [];

        if (isset($body['name'])) {
            $name = trim($body['name']);
            if ($name === '') {
                return $this->response->setStatusCode(400)
                    ->setJSON(['error' => 'ชื่อ config ต้องไม่ว่าง']);
            }
            $updateData['name'] = $name;
        }

        if (isset($body['api_url'])) {
            $apiUrl = trim($body['api_url']);
            if ($apiUrl === '') {
                return $this->response->setStatusCode(400)
                    ->setJSON(['error' => 'api_url ต้องไม่ว่าง']);
            }
            $updateData['api_url'] = $apiUrl;
        }

        if (isset($body['is_active'])) {
            $updateData['is_active'] = (bool) $body['is_active'];
        }

        if (! empty($updateData)) {
            $this->model->update($id, $updateData);
        }

        $updated = $this->model->find($id);
        return $this->response->setStatusCode(200)
            ->setJSON(['data' => $updated]);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DELETE /api/external-api-configs/{id}
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * ลบ config — ห้ามลบถ้ายังมี snapshot อ้างอิงใน sync_from_api
     */
    public function delete(int $id): ResponseInterface
    {
        $config = $this->model->find($id);
        if (! $config) {
            return $this->response->setStatusCode(404)
                ->setJSON(['error' => 'ไม่พบ config นี้']);
        }
        if (! $this->canAccessProject((int) $config['project_id'])) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        // ตรวจว่ามี snapshot อ้างอิงอยู่หรือไม่
        if ($this->model->hasSnapshots($id)) {
            return $this->response->setStatusCode(409)
                ->setJSON(['error' => 'ไม่สามารถลบได้ เนื่องจากมีข้อมูล snapshot อ้างอิง config นี้อยู่']);
        }

        $this->model->delete($id);
        return $this->response->setStatusCode(200)
            ->setJSON(['message' => 'ลบ config สำเร็จ']);
    }
}
