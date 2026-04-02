<?php

namespace App\Controllers;

use App\Services\FeeFormulaService;
use CodeIgniter\HTTP\ResponseInterface;
use RuntimeException;

class FeeFormulaController extends BaseController
{
    private FeeFormulaService $svc;
    public function __construct() { $this->svc = new FeeFormulaService(); }

    private function canWrite(): bool { return in_array($this->request->user_role ?? '', ['admin', 'manager'], true); }

    public function index(): ResponseInterface
    {
        $projectId = (int) ($this->request->getGet('project_id') ?? 0);
        return $this->response->setStatusCode(200)->setJSON(['data' => $this->svc->listFormulas($projectId ?: null)]);
    }

    public function show(int $id): ResponseInterface
    {
        $r = $this->svc->getFormula($id);
        return $r ? $this->response->setStatusCode(200)->setJSON(['data' => $r])
                  : $this->response->setStatusCode(404)->setJSON(['error' => 'ไม่พบสูตร']);
    }

    public function create(): ResponseInterface
    {
        if (!$this->canWrite()) return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์']);
        try {
            $r = $this->svc->createFormula($this->request->getJSON(true) ?? []);
            return $this->response->setStatusCode(201)->setJSON(['message' => 'สร้างสูตรสำเร็จ', 'data' => $r]);
        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(400)->setJSON(['error' => $e->getMessage()]);
        }
    }

    public function update(int $id): ResponseInterface
    {
        if (!$this->canWrite()) return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์']);
        try {
            $r = $this->svc->updateFormula($id, $this->request->getJSON(true) ?? []);
            return $this->response->setStatusCode(200)->setJSON(['message' => 'อัปเดตสูตรสำเร็จ', 'data' => $r]);
        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(400)->setJSON(['error' => $e->getMessage()]);
        }
    }

    public function delete(int $id): ResponseInterface
    {
        if (!$this->canWrite()) return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์']);
        try {
            $this->svc->deleteFormula($id);
            return $this->response->setStatusCode(200)->setJSON(['message' => 'ลบสูตรสำเร็จ']);
        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(400)->setJSON(['error' => $e->getMessage()]);
        }
    }

    public function test(): ResponseInterface
    {
        try {
            $r = $this->svc->testCalculation($this->request->getJSON(true) ?? []);
            return $this->response->setStatusCode(200)->setJSON($r);
        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(400)->setJSON(['error' => $e->getMessage()]);
        }
    }

    public function testBatch(): ResponseInterface
    {
        $body = $this->request->getJSON(true) ?? [];
        try {
            $r = $this->svc->testBatch(
                (int) ($body['fee_formula_id'] ?? 0),
                $body['sale_date'] ?? date('Y-m-d'),
                (int) ($body['project_id'] ?? 0)
            );
            return $this->response->setStatusCode(200)->setJSON($r);
        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(400)->setJSON(['error' => $e->getMessage()]);
        }
    }

    public function calculateForEntry(): ResponseInterface
    {
        $body   = $this->request->getJSON(true) ?? [];
        $itemId = (int) ($body['promotion_item_id'] ?? 0);
        $unitId = (int) ($body['unit_id'] ?? 0);

        if ($itemId <= 0) {
            return $this->response->setStatusCode(400)->setJSON(['error' => 'กรุณาระบุ promotion_item_id']);
        }

        $db   = \Config\Database::connect();
        $unit = $db->table('project_units pu')
            ->select('pu.base_price, pu.appraisal_price, pu.unit_cost, pr.project_type')
            ->join('projects pr', 'pr.id = pu.project_id', 'left')
            ->where('pu.id', $unitId)->get()->getRowArray();

        if (!$unit) {
            return $this->response->setStatusCode(404)->setJSON(['error' => 'ไม่พบยูนิต']);
        }

        $unitData = [
            'base_price'      => (float) $unit['base_price'],
            'appraisal_price' => $unit['appraisal_price'] !== null ? (float) $unit['appraisal_price'] : null,
            'unit_cost'       => (float) $unit['unit_cost'],
            'project_type'    => $unit['project_type'] ?? '',
        ];

        $result = $this->svc->calculateForSalesEntry(
            $itemId,
            $unitData,
            $body['sale_date'] ?? date('Y-m-d'),
            isset($body['net_price']) ? (float) $body['net_price'] : null,
            isset($body['manual_input']) ? (float) $body['manual_input'] : null,
        );

        return $this->response->setStatusCode(200)->setJSON($result);
    }
}
