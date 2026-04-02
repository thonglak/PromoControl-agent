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
}
