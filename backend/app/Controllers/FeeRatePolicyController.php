<?php

namespace App\Controllers;

use App\Services\FeeFormulaService;
use CodeIgniter\HTTP\ResponseInterface;
use RuntimeException;

class FeeRatePolicyController extends BaseController
{
    private FeeFormulaService $svc;
    public function __construct() { $this->svc = new FeeFormulaService(); }

    private function canWrite(): bool { return in_array($this->request->user_role ?? '', ['admin', 'manager'], true); }

    public function index(): ResponseInterface
    {
        $fid = (int) ($this->request->getGet('fee_formula_id') ?? 0);
        if ($fid <= 0) return $this->response->setStatusCode(400)->setJSON(['error' => 'กรุณาระบุ fee_formula_id']);
        return $this->response->setStatusCode(200)->setJSON(['data' => $this->svc->listPolicies($fid)]);
    }

    public function create(): ResponseInterface
    {
        if (!$this->canWrite()) return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์']);
        try {
            $r = $this->svc->createPolicy($this->request->getJSON(true) ?? []);
            return $this->response->setStatusCode(201)->setJSON(['message' => 'สร้างนโยบายสำเร็จ', 'data' => $r]);
        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(400)->setJSON(['error' => $e->getMessage()]);
        }
    }

    public function update(int $id): ResponseInterface
    {
        if (!$this->canWrite()) return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์']);
        try {
            $r = $this->svc->updatePolicy($id, $this->request->getJSON(true) ?? []);
            return $this->response->setStatusCode(200)->setJSON(['message' => 'อัปเดตนโยบายสำเร็จ', 'data' => $r]);
        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(400)->setJSON(['error' => $e->getMessage()]);
        }
    }

    public function delete(int $id): ResponseInterface
    {
        if (!$this->canWrite()) return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์']);
        try {
            $this->svc->deletePolicy($id);
            return $this->response->setStatusCode(200)->setJSON(['message' => 'ลบนโยบายสำเร็จ']);
        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(400)->setJSON(['error' => $e->getMessage()]);
        }
    }

    public function toggle(int $id): ResponseInterface
    {
        if (!$this->canWrite()) return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์']);
        try {
            $r = $this->svc->togglePolicy($id);
            return $this->response->setStatusCode(200)->setJSON(['message' => 'อัปเดตสถานะสำเร็จ', 'data' => $r]);
        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(400)->setJSON(['error' => $e->getMessage()]);
        }
    }

    // GET /api/fee-rate-policies/export-json?fee_formula_id=N
    public function exportJson(): ResponseInterface
    {
        $fid = (int) ($this->request->getGet('fee_formula_id') ?? 0);
        if ($fid <= 0) return $this->response->setStatusCode(400)->setJSON(['error' => 'กรุณาระบุ fee_formula_id']);
        try {
            $r = $this->svc->exportPoliciesForFormula($fid);
            return $this->response->setStatusCode(200)->setJSON([
                'count'               => count($r['items']),
                'fee_formula_id'      => $r['fee_formula_id'],
                'promotion_item_code' => $r['promotion_item_code'],
                'promotion_item_name' => $r['promotion_item_name'],
                'items'               => $r['items'],
            ]);
        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(404)->setJSON(['error' => $e->getMessage()]);
        }
    }

    // POST /api/fee-rate-policies/import-json — body: { fee_formula_id, items: [...] }
    public function importJson(): ResponseInterface
    {
        if (!$this->canWrite()) return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์']);

        $body  = $this->request->getJSON(true) ?? [];
        $fid   = (int) ($body['fee_formula_id'] ?? 0);
        $items = $body['items'] ?? [];

        if ($fid <= 0) return $this->response->setStatusCode(400)->setJSON(['error' => 'กรุณาระบุ fee_formula_id']);
        if (!is_array($items) || empty($items)) {
            return $this->response->setStatusCode(422)->setJSON(['error' => 'ไม่พบรายการในไฟล์']);
        }
        if (count($items) > 200) {
            return $this->response->setStatusCode(422)->setJSON(['error' => 'นำเข้าได้สูงสุดครั้งละ 200 รายการ']);
        }

        try {
            $r = $this->svc->importPolicies($fid, $items);
            return $this->response->setStatusCode(200)->setJSON([
                'message' => 'นำเข้าสำเร็จ',
                'data'    => $r,
            ]);
        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(400)->setJSON(['error' => $e->getMessage()]);
        }
    }

    // POST /api/fee-rate-policies/import-json-by-code
    // body: { project_id, promotion_item_code, items: [...] }
    public function importJsonByCode(): ResponseInterface
    {
        if (!$this->canWrite()) return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์']);

        $body      = $this->request->getJSON(true) ?? [];
        $projectId = (int) ($body['project_id'] ?? 0);
        $code      = (string) ($body['promotion_item_code'] ?? '');
        $items     = $body['items'] ?? [];

        if ($projectId <= 0) return $this->response->setStatusCode(400)->setJSON(['error' => 'กรุณาระบุ project_id']);
        if (trim($code) === '') return $this->response->setStatusCode(400)->setJSON(['error' => 'กรุณาระบุ promotion_item_code']);
        if (!is_array($items) || empty($items)) {
            return $this->response->setStatusCode(422)->setJSON(['error' => 'ไม่พบรายการในไฟล์']);
        }
        if (count($items) > 200) {
            return $this->response->setStatusCode(422)->setJSON(['error' => 'นำเข้าได้สูงสุดครั้งละ 200 รายการ']);
        }

        try {
            $r = $this->svc->importPoliciesByCode($projectId, $code, $items);
            return $this->response->setStatusCode(200)->setJSON([
                'message' => 'นำเข้าสำเร็จ',
                'data'    => $r,
            ]);
        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(400)->setJSON(['error' => $e->getMessage()]);
        }
    }
}
