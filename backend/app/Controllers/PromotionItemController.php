<?php

namespace App\Controllers;

use App\Services\PromotionItemService;
use App\Services\EligiblePromotionService;
use CodeIgniter\HTTP\ResponseInterface;
use RuntimeException;

class PromotionItemController extends BaseController
{
    private PromotionItemService $service;
    public function __construct() { $this->service = new PromotionItemService(); }

    private function isAdmin(): bool { return ($this->request->user_role ?? '') === 'admin'; }
    private function canWrite(): bool { return in_array($this->request->user_role ?? '', ['admin', 'manager'], true); }
    private function canAccessProject(int $pid): bool {
        if ($this->isAdmin()) return true;
        return in_array($pid, array_map('intval', (array) ($this->request->project_ids ?? [])), true);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GET /api/promotion-items?project_id=
    // ═══════════════════════════════════════════════════════════════════════

    public function index(): ResponseInterface
    {
        $projectId = (int) ($this->request->getGet('project_id') ?? 0);
        if ($projectId <= 0) return $this->response->setStatusCode(400)->setJSON(['error' => 'กรุณาระบุโครงการ']);
        if (!$this->canAccessProject($projectId)) return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);

        $filters = [
            'category'         => $this->request->getGet('category'),
            'value_mode'       => $this->request->getGet('value_mode'),
            'is_unit_standard' => $this->request->getGet('is_unit_standard'),
            'is_active'        => $this->request->getGet('is_active'),
            'search'           => $this->request->getGet('search'),
        ];
        return $this->response->setStatusCode(200)->setJSON(['data' => $this->service->getList($projectId, $filters)]);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GET /api/promotion-items/:id
    // ═══════════════════════════════════════════════════════════════════════

    public function show(int $id): ResponseInterface
    {
        $item = $this->service->getById($id);
        if (!$item) return $this->response->setStatusCode(404)->setJSON(['error' => 'ไม่พบรายการโปรโมชั่น']);
        if (!$this->canAccessProject((int) $item['project_id'])) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์ดูรายการของแถมโครงการอื่น']);
        }
        return $this->response->setStatusCode(200)->setJSON(['data' => $item]);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // POST /api/promotion-items
    // ═══════════════════════════════════════════════════════════════════════

    public function create(): ResponseInterface
    {
        if (!$this->canWrite()) return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์สร้างรายการ']);
        $body = $this->request->getJSON(true) ?? [];
        $projectId = (int) ($body['project_id'] ?? 0);
        if ($projectId <= 0) return $this->response->setStatusCode(400)->setJSON(['error' => 'กรุณาระบุโครงการ']);
        if (!$this->canAccessProject($projectId)) return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);

        try {
            $item = $this->service->create($projectId, $body, (array) ($body['eligible_house_model_ids'] ?? []), (array) ($body['eligible_unit_ids'] ?? []));
            return $this->response->setStatusCode(201)->setJSON(['message' => 'สร้างรายการโปรโมชั่นสำเร็จ', 'data' => $item]);
        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(400)->setJSON(['error' => $e->getMessage()]);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PUT /api/promotion-items/:id
    // ═══════════════════════════════════════════════════════════════════════

    public function update(int $id): ResponseInterface
    {
        if (!$this->canWrite()) return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์แก้ไขรายการ']);
        $body = $this->request->getJSON(true) ?? [];

        try {
            $item = $this->service->update($id, $body, (array) ($body['eligible_house_model_ids'] ?? []), (array) ($body['eligible_unit_ids'] ?? []));
            return $this->response->setStatusCode(200)->setJSON(['message' => 'อัปเดตรายการโปรโมชั่นสำเร็จ', 'data' => $item]);
        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(400)->setJSON(['error' => $e->getMessage()]);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DELETE /api/promotion-items/:id
    // ═══════════════════════════════════════════════════════════════════════

    public function delete(int $id): ResponseInterface
    {
        if (!$this->canWrite()) return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์ลบรายการ']);
        try {
            $this->service->delete($id);
            return $this->response->setStatusCode(200)->setJSON(['message' => 'ลบรายการโปรโมชั่นสำเร็จ']);
        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(400)->setJSON(['error' => $e->getMessage()]);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GET /api/promotion-items/eligible?project_id=&unit_id=&sale_date=
    // ═══════════════════════════════════════════════════════════════════════

    public function eligible(): ResponseInterface
    {
        $projectId = (int) ($this->request->getGet('project_id') ?? 0);
        $unitId    = (int) ($this->request->getGet('unit_id') ?? 0);
        $saleDate  = $this->request->getGet('sale_date') ?? date('Y-m-d');

        if ($projectId <= 0) return $this->response->setStatusCode(400)->setJSON(['error' => 'กรุณาระบุ project_id']);
        if ($unitId <= 0)    return $this->response->setStatusCode(400)->setJSON(['error' => 'กรุณาระบุ unit_id']);
        if (!$this->canAccessProject($projectId)) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        try {
            $eligibleSvc = new EligiblePromotionService();
            $result = $eligibleSvc->getEligibleItems($projectId, $unitId, $saleDate);
            return $this->response->setStatusCode(200)->setJSON(['data' => $result]);
        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(400)->setJSON(['error' => $e->getMessage()]);
        }
    }
}
